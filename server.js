const fs = require("fs");
const express = require("express");
const httpProxy = require("http-proxy");

const mozlog = require("mozlog")({
  app: "topsites-proxy"
});
const log = mozlog("general");

const verfile = __dirname + "/version.json";

const app = express();
const proxy = httpProxy.createProxyServer({});

const CONFIG = {
  AMZN_2020_1: {
    url: `http://localhost:${process.env.PORT}/test`,
    query: {
      key: process.env["AMZN_2020_1_KEY"] || "test",
      cuid: "AMZN_2020_1"
    }
  }
};

const createTarget = options => {
  let target = options.url;
  let query = [];

  if (options.query) {
    for (let paramName of Object.getOwnPropertyNames(options.query)) {
      query.push(paramName + "=" + options.query[paramName]);
    }
  }
  return options.url + (query.length ? "?" + query.join("&") : "");
}

app.use("/cid/:cid", (req, res) => {
  let cid = req.params.cid && req.params.cid.trim();
  if (!cid) {
    log.error("server", {msg: "no campaign identifier found"});
    return;
  }

  let campaign = CONFIG[cid];
  if (!campaign) {
    log.error("server", {msg: "invalid campaign identifier: " + cid});
    return;
  }

  proxy.web(req, res, { target: createTarget(campaign) });
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

// listen on the PORT env. variable
if (process.env.PORT) {
  app.listen(process.env.PORT, () => {
    log.info("server", {msg: "listening", port: process.env.PORT});

    let cid = process.env.TEST;
    if (cid) {
      // If no valid campaign identifier was passed in, e.g. 'TEST=yes', then
      // we'll take the last defined cid from the CONFIG above.
      if (!CONFIG[cid]) {
        cid = Object.getOwnPropertyNames(CONFIG).pop();
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
