const Assert = require("assert");
const { withServer, sendForwardRequest, PORT, STOP } = require("./utils");

describe("Top Sites forward request endpoint - region mismatches", function() {

  it("should fail requests with non-matching regions", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      let data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "de",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.ca"
        },
        expectedStatusCode: 412,
        waitForServerLogMessage: "region mismatch"
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "ca",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.co.uk"
        },
        expectedStatusCode: 412,
        waitForServerLogMessage: "region mismatch"
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "gb",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.com.au"
        },
        expectedStatusCode: 412,
        waitForServerLogMessage: "region mismatch"
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "ca",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.com"
        },
        expectedStatusCode: 412,
        waitForServerLogMessage: "region mismatch"
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "fr",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.de"
        },
        expectedStatusCode: 412,
        waitForServerLogMessage: "region mismatch"
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "de",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.fr"
        },
        expectedStatusCode: 412,
        waitForServerLogMessage: "region mismatch"
      });

      Assert.ok(data);
    });
  });

  it("should should forward requests that have matching regions (sanity check)", async function() {
    return withServer(async server => {
      const cid = "amzn_2020_1";
      let data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "ca",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.ca"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "gb",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.co.uk"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "au",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.com.au"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "us",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.com"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "de",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.de"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);

      data = await sendForwardRequest(server, {
        url: `http://localhost:${PORT}/cid/${cid}`,
        headers: {
          "X-Region": "fr",
          "X-Source": "newtab",
          "X-Target-URL": "https://www.example.fr"
        },
        waitForServerLogMessage: `forwarding ${cid} to `
      });

      Assert.ok(data);
    });
  });

});
