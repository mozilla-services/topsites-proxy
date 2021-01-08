const express = require("express");
const fs = require("fs");
const forwardRequest = require("./lib/forward-request");
const psl = require("psl");
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
      sub1: "amazon",
      key: process.env["AMZN_2020_1_KEY"] || "test",
      cuid: "amzn_2020_1",
      // Reads the X-Region header.
      h1: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-region${SPECIAL_DELIM}`,
      // Reads the X-Source header.
      h2: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-source${SPECIAL_DELIM}`,
      // Reads the X-Target-URL header.
      cu: `${SPECIAL_DELIM}header${SPECIAL_SEP}x-target-url${SPECIAL_DELIM}`
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
  },
  weather_conditions: {
    url: process.env["WEATHER_CONDITIONS_URL"],
    query: {
      apikey: process.env["WEATHER_KEY"],
    }
  },
  weather_location: {
    url: process.env["WEATHER_LOCATION_URL"],
    query: {
      // Consumers should pass a `q` parameter in the URL.
      apikey: process.env["WEATHER_KEY"],
    }
  },
};
const PUBLIC_SUFFIX_TO_REGION = new Map([
  ["ca", "ca"],
  ["co.uk", "gb"],
  ["com.au", "au"],
  ["com", "us"],
  ["de", "de"],
  ["fr", "fr"]
]);
const ERR_REGION_MISMATCH = "Public suffix region mismatch.";

/**
 * Constructs the URL to be fetched via this proxy. First, we merge pre-defined
 * query parameters from `options` (if any) with any query paramters passed in
 * via the URL. Then we make partner-specific adjustments to the URL. Finally,
 * we perform any required special handling on query parameters, such as
 * encoding URIs.
 *
 * @param {Request} req
 *   The request from the client.
 * @param {object} options
 *   The object in CONFIG above corresponding to the endpoint requested by the
 *   client. For example, if the client called
 *   https://<SERVER_URL>/cid/amzn_2020_a1, `options` should be the contents of
 *   CONFIG.amzn_2020_a1.
 */
const createTarget = (req, options) => {
  let query = [];

  // Clone the object for single use inside this method.
  options = Object.assign({}, options);
  options.query = Object.assign({}, options.query);
  if (req.query) {
    // Merge the query parameters passed to the proxy with those pre-defined in
    // options.query.
    Object.assign(options.query, req.query);
  }

  let XTargetURL = req.headers["x-target-url"];
  let url, tld;
  if (XTargetURL) {
    try {
      url = new URL(XTargetURL);
      tld = psl.parse(url.hostname).tld;
    } catch (ex) {
      log.info("server", {msg: "Invalid URL passed for X-Target-URL: " + XTargetURL});
    }

    // TEMP WORKAROUND: if the region passed in the X-Region header doesn't
    // match up with the region that the public suffix indicates, throw an error.
    let XRegion = req.headers["x-region"];
    if (tld && XRegion && PUBLIC_SUFFIX_TO_REGION.has(tld)) {
      if (PUBLIC_SUFFIX_TO_REGION.get(tld) != XRegion.toLowerCase()) {
        throw new Error(ERR_REGION_MISMATCH);
      }
    }

    // Support the eBay campaign.
    if (XTargetURL.startsWith("https://www.ebay.")) {
      options.query.sub1 = "ebay";
    }

    // Extract the `ctag` parameter from the target URL.
    let tag = url.searchParams.get("ref") || url.searchParams.get("crlp");
    if (tag) {
      query.push("ctag=" + encodeURIComponent(tag.replace("pd_sl_a", "")));
    }
  }

  if (options.url == process.env["WEATHER_CONDITIONS_URL"]) {
    // The weather conditions API requires a dynamic key to be in the URL path
    // rather than in the query paramters.
    if (options.query.locationKey) {
      options.url = `${options.url}${options.query.locationKey}.json`;
    } else {
      throw new Error("locationKey parameter must be provided.");
    }
  }

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
  return options.url + (query.length ? "?" + query.join("&") : "");
}

const pruneUserAgent = ua => {
  return (ua || "").replace(/\(([^;]+);.*(rv:[\d.]+)\)/i, "($1; $2)")
    .replace(/windows[^;]+;/i, "Windows NT;")
};

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
  if ((campaign.method || "GET") != req.method) {
    throw "invalid request method: " + req.method;
  }

  let target = createTarget(req, campaign);
  log.info("server", { msg: `forwarding ${cid} to ${target}` });

  forwardRequest(req, res, {
    target,
    headers: {
      // We omit the platform data from the user-agent string.
      "user-agent": pruneUserAgent(req.headers["user-agent"])
    }
  });
});

if ((process.env.NODE_ENV || "").startsWith("dev")) {
  app.get("/test", (req, res) => {
    res.status(301).send("TEST: " + req.url + "\n" + (req.headers["user-agent"] || ""));
  });
}

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
  // If we detected a region mismatch, mark the request with a different code.
  res.status(msg.includes(ERR_REGION_MISMATCH) ? 412 : 500).send({
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
