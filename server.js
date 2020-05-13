const fs = require("fs");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const mozlog = require("mozlog")({
  app: "topsites-proxy"
});
const log = mozlog("general");

const verfile = __dirname + "/version.json";

const app = express();

var config;
const getConfig = () => {
  if (config) {
    return config;
  }
  if (!process.env.CONFIG) {
    log.error("server", {msg: "no CONFIG env var"});
    return;
  }
  try {
    config = JSON.parse(process.env.CONFIG);
  } catch (ex) {
    log.error("server", {msg: "invalid config: " + ex.message});
  }
  return config;
}

const createRequestObject = options => {
  let obj = {};
  let query = [];

  for (let option of Object.getOwnPropertyNames(options)) {
    if (option != "query") {
      query[option] = options[option];
      continue;
    }
    for (let paramName of Object.getOwnPropertyNames(options.query)) {
      query.push(paramName + "=" + options.query[paramName]);
    }
  }
  if (query.length) {
    if (!obj.path) {
      obj.path = "/";
    }
    obj.path += "?" + query.join("&");
  }
  return obj;
}

app.get("/cid/:cid", createProxyMiddleware({
  router: req => {
    let cid = req.params.cid && req.params.cid.trim();
    if (!cid) {
      log.error("server", {msg: "no campaign identifier found"});
      return;
    }
    let config = getConfig();
    if (!config) {
      // Error has been logged already.
      return;
    }

    let campaign = config[cid];
    if (!campaign) {
      log.error("server", {msg: "invalid campaign identifier: " + cid});
      return;
    }

    return createRequestObject(campaign);
  }
}));

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
  app.listen(process.env.PORT, () => log.info("server", {msg: "listening", port: process.env.PORT}));
} else {
  log.error("server", {msg: "no PORT env var"});
}
