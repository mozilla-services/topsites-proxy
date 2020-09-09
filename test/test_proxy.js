const Assert = require("assert");
const http = require("http");
const { withServer, checkServerLogs, PORT, STOP } = require("./utils");

describe("Top Sites proxy endpoint", function() {

  it("should return 500 for request to /cid/:cid with an invalid cid", async function() {
    return withServer(async server => {
      const cid = "not_found";
      const logsPromise = checkServerLogs(server, [`invalid campaign identifier: ${cid}`]);

      let res = await new Promise(resolve => http.get(`http://localhost:${PORT}/cid/${cid}`, resolve));
      Assert.equal(res.statusCode, 500);

      let data = await new Promise(resolve => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", chunk => rawData += chunk);
        res.on("end", () => {
          resolve(rawData);
        });
      });
      await logsPromise;

      Assert.ok(data);
    });
  });

  it("should handle proper requests to /cid/:cid properly", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      const logsPromise = checkServerLogs(server, [`proxying ${cid} to `]);

      let res = await new Promise(resolve => http.get(`http://localhost:${PORT}/cid/${cid}`, resolve));
      Assert.equal(res.statusCode, 200);

      let data = await new Promise(resolve => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", chunk => rawData += chunk);
        res.on("end", () => {
          resolve(rawData);
        });
      });
      await logsPromise;

      Assert.ok(data);
      Assert.equal(data.trim(), `TEST: /test?key=xxx&cuid=${cid}&h1=&h2=`);
    });
  });

  it("should handle proper requests to /cid/:cid properly WITH headers", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      const logsPromise = checkServerLogs(server, [`proxying ${cid} to `]);

      let res = await new Promise(resolve => http.get(`http://localhost:${PORT}/cid/${cid}`, {
        headers: {
          "X-Region": "us",
          "X-Source": "newtab"
        }
      }, resolve));
      Assert.equal(res.statusCode, 200);

      let data = await new Promise(resolve => {
        res.setEncoding("utf8");
        let rawData = "";
        res.on("data", chunk => rawData += chunk);
        res.on("end", () => {
          resolve(rawData);
        });
      });
      await logsPromise;

      Assert.ok(data);
      Assert.equal(data.trim(), `TEST: /test?key=xxx&cuid=${cid}&h1=us&h2=newtab`);
    });
  });
});
