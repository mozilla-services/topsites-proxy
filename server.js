const fs = require("fs");
const forwardRequest = require("./lib/forward-request");
const express = require("express");
const sentry = require("@sentry/node");

const mozlog = require("mozlog")({
  app: "topsites-proxy"
});
const log = mozlog("general");

const verfile = __dirname + "/version.json";

const app = express();
const dsn = process.env["SENTRY_DSN"] || "";
if (dsn) {
  sentry.init({ dsn });
}

const SPECIAL_DELIM = "%";
const SPECIAL_SEP = ":";
const SPECIAL_ARG_REGEXP = new RegExp(`[${SPECIAL_DELIM + SPECIAL_SEP}]+`);
const CONFIG = {
  amzn_2020_1: {
    url: `http://localhost:${process.env.PORT}/test`,
    query: {
      key: process.env["AMZN_2020_1_KEY"] || "test",
      cuid: "amzn_2020_1",
      h1: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-region${SPECIAL_DELIM}`,
      h2: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-source${SPECIAL_DELIM}`
    }
  },
  inspect: {
    url: "https://8d90580d9eed29ad24e62f5dfa7f87e5.m.pipedream.net",
    query: {
      sub1: "amazon",
      sub2: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-region${SPECIAL_DELIM}`,
      sub3: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-source${SPECIAL_DELIM}`,
      cu: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-target-url${SPECIAL_DELIM}`
    }
  },
  amzn_2020_a1: {
    url: process.env["AMZN_2020_A1_URL"],
    query: {
      sub1: "amazon",
      sub2: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-region${SPECIAL_DELIM}`,
      sub3: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-source${SPECIAL_DELIM}`,
      cu: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-target-url${SPECIAL_DELIM}`
    }
  }
};

const createTarget = (req, options) => {
  let query = [];
  if (options.query) {
    for (let paramName of Object.getOwnPropertyNames(options.query)) {
      let paramValue = options.query[paramName];
      let parts = paramValue.toLowerCase().split(SPECIAL_ARG_REGEXP);
      if (parts.length >= 3 && !parts.pop() && !parts.shift()) {
        if (parts[0] == "header") {
          let header = parts[1];
          paramValue = (req.headers[header] || "");
          if (header == "x-target-url") {
            paramValue = encodeURIComponent(paramValue);
          } else {
            paramValue = paramValue.toLowerCase();
            // Translate 'GB' to 'UK'. I know, but let's just not fret the details
            // right now.
            if (paramValue == "gb") {
              paramValue = "uk";
            }
          }
        }
      }
      query.push(paramName + "=" + paramValue);
    }
  }
  return options.url + (query.length ? "?" + query.join("&") : "");
}

app.use(sentry.Handlers.requestHandler());

app.use("/cid/:cid", (req, res) => {
  let cid = req.params.cid && req.params.cid.trim();
  if (!cid) {
    throw "no campaign identifier found";
  }

  cid = cid.toLowerCase();
  let campaign = CONFIG[cid];
  if (!campaign) {
    throw "invalid campaign identifier: " + cid;
  }
  if (!campaign.url) {
    throw "invalid campaign, please check environment variables.";
  }

  let target = createTarget(req, campaign);
  log.info("server", { msg: `forwarding ${cid} to ${target}` });

  forwardRequest(req, res, {
    target,
    headers: {
      // We omit the platform data from the user-agent string.
      "user-agent": req.headers["user-agent"].replace(/\(([^;]+);.*(rv:[\d.]+)\)/i, "($1; $2)")
    }
  });
});

app.get("/test", (req, res) => {
  res.status(200).send("TEST: " + req.url);
});

// For service monitoring to make sure the service is responding and normal.
app.get("/__heartbeat__", (req, res) => {
  fs.stat(verfile, (err) => {
    if (err) {
      res.status(500).send({ "status": "error", "checks": {"version_file_exists": "error"}, "details": {} });
    } else {
      res.send({ "status": "ok", "checks": {"version_file_exists": "ok"}, "details": {} });
    }
  });
});

// for load balancers to make sure the app is running.
app.get("/__lbheartbeat__", (req, res) => res.send("OK"));

app.get("/__version__", (req, res) => {
  fs.stat(verfile, (err, stats) => {
    if (err) {
      res.status(404).send("version data not found");
    } else {
      res.sendFile(verfile);
    }
  });
});

app.use(sentry.Handlers.errorHandler());
app.use(function errorHandler(err, req, res, next) {
  let msg = err + "";
  log.error("server", { msg });
  res.status(500).send({
    status: "error",
    "details": {
      msg,
      sentry: res.sentry
    }
  });
});

// listen on the PORT env. variable
if (process.env.PORT) {
  app.listen(process.env.PORT, () => {
    log.info("server", {msg: "listening", port: process.env.PORT});

    let cid = process.env.TEST;
    if (cid) {
      // If no valid campaign identifier was passed in, e.g. 'TEST=yes', then
      // we'll take the last defined cid from the CONFIG above.
      if (!CONFIG[cid]) {
        cid = Object.getOwnPropertyNames(CONFIG).shift();
      }
      require("http").request({
        host: "localhost",
        port: process.env.PORT,
        path: "/cid/" + cid
      }, res => {
        res.setEncoding("utf-8");
        res.on("data", str => log.info("server", {msg: str}));
        res.on("end", () => log.info("server", {msg: "test terminated."}));
      }).end();
    }
  });
} else {
  log.error("server", {msg: "no PORT env var"});
}
