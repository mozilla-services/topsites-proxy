const Assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { withServer, checkServerLogs, PORT, STOP } = require("./utils");

describe("Dockerflow server endpoints test", function() {
  it("should handle requests to /__version__ properly", async function() {
    return withServer(async server => {
      let res = await new Promise(resolve => http.get(`http://localhost:${PORT}/__version__`, resolve));
      Assert.equal(res.statusCode, 200);

      let data = await new Promise(resolve => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", chunk => rawData += chunk);
        res.on("end", () => {
          resolve(JSON.parse(rawData));
        });
      });
      
      Assert.ok(data);
      let compareData = JSON.parse(fs.readFileSync(path.normalize(path.join(__dirname, "..", "version.json"))));
      Assert.equal(data.source, compareData.source);
      Assert.equal(data.version, compareData.version);
      Assert.equal(data.commit, compareData.commit);
    });
  });

  it("should handle requests to /__heartbeat__ properly", async function() {
    return withServer(async server => {
      let res = await new Promise(resolve => http.get(`http://localhost:${PORT}/__heartbeat__`, resolve));
      Assert.equal(res.statusCode, 200);

      let data = await new Promise(resolve => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", chunk => rawData += chunk);
        res.on("end", () => {
          resolve(JSON.parse(rawData));
        });
      });

      Assert.ok(data);
      Assert.equal(data.status, "ok");
      Assert.equal(data.checks.version_file_exists, "ok");
      Assert.deepEqual(data.details, {});
    });
  });

  it("should handle requests to /__lbheartbeat__ properly", async function() {
    return withServer(async server => {
      let res = await new Promise(resolve => http.get(`http://localhost:${PORT}/__lbheartbeat__`, resolve));
      Assert.equal(res.statusCode, 200);

      let data = await new Promise(resolve => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", chunk => rawData += chunk);
        res.on("end", () => {
          resolve(rawData);
        });
      });

      Assert.ok(data);
      Assert.equal(data.trim(), "OK");
    });
  });
});
