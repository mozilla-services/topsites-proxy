const Assert = require("assert");
const { withServer, sendForwardRequest, PORT, STOP } = require("./utils");

describe("Top Sites forward request endpoint", function() {

  it("should return 500 for request to /cid/:cid with an invalid cid", async function() {
    return withServer(async server => {
      const cid = "not_found";
      const data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        expectedStatusCode: 500,
        waitForServerLogMessage: `invalid campaign identifier: ${cid}`
      });

      Assert.ok(data);
    });
  });

  it("should handle proper requests to /cid/:cid properly", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      const data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);
      Assert.equal(data.trim(), `TEST: /test?key=xxx&cuid=${cid}&h1=&h2=`);
    });
  });

  it("should handle proper requests to /cid/:cid properly WITH headers", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      const data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:80.0) Gecko/20100101 Firefox/80.0",
          "X-Region": "us",
          "X-Source": "newtab"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      let [query, userAgent] = data.split("\n");
      Assert.ok(query);
      Assert.equal(query.trim(), `TEST: /test?key=xxx&cuid=${cid}&h1=us&h2=newtab`);
      // Header should be pruned of unnecessary PII data:
      Assert.equal(userAgent.trim(), "Mozilla/5.0 (Macintosh; rv:80.0) Gecko/20100101 Firefox/80.0");
    });
  });

  it("should handle proper requests to /cid/:cid replacing gb with uk", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      let data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "gb",
          "X-Source": "newtab"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);
      Assert.equal(data.trim(), `TEST: /test?key=xxx&cuid=${cid}&h1=uk&h2=newtab`);
    });
  });

  it("should handle proper requests to /cid/:cid normalizing user-agent header", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      let data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "us",
          "X-Source": "newtab",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:82.0) Gecko/20100101 Firefox/82.0",
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      let [query, userAgent] = data.split("\n");
      Assert.ok(query);
      Assert.equal(userAgent.trim(), "Mozilla/5.0 (X11; rv:82.0) Gecko/20100101 Firefox/82.0");

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "us",
          "X-Source": "newtab",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:80.0) Gecko/20100101 Firefox/80.0",
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      [query, userAgent] = data.split("\n");
      Assert.ok(query);
      Assert.equal(userAgent.trim(), "Mozilla/5.0 (Windows; rv:80.0) Gecko/20100101 Firefox/80.0");

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "us",
          "X-Source": "newtab",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:80.0) Gecko/20100101 Firefox/80.0",
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      [query, userAgent] = data.split("\n");
      Assert.ok(query);
      Assert.equal(userAgent.trim(), "Mozilla/5.0 (Macintosh; rv:80.0) Gecko/20100101 Firefox/80.0");
    });
  });

  it("should handle proper requests to /cid/:cid stripping cookies", async function() {
    process.env["AMZN_2020_A1_URL"] = "https://httpbin.org/cookies";
    return withServer(async server => {
      const cid = "amzn_2020_a1";
      const data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "us",
          "X-Source": "newtab",
          "Cookie": ["type=ninja", "language=javascript"]
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);
      Assert.deepEqual(JSON.parse(data).cookies, {});
    });
  });

});
