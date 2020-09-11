const Assert = require("assert");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 8000;
const defaultEnv = {
  AMZN_2020_1_KEY: "xxx",
  PORT
};

async function withServer(callback, env = defaultEnv, logData = false) {
  let cwd = path.normalize(path.join(__dirname, ".."));
  Object.assign(env, process.env);
  env.NODE_ENV = "dev";
  let server = spawn("node", [path.join(cwd, "server.js")], { cwd, env });
  server.stderr.pipe(process.stderr);

  function dumpIt(data) {
    if (!logData) {
      return;
    }
    console.log(data);
  }

  await new Promise(resolve => {
    server.stdout.setEncoding("utf-8");
    // Mocha's built-in timeout handling will take of this taking too long.
    server.stdout.on("data", function onData(data) {
      dumpIt(data);
      if (data.indexOf("listening") > -1) {
        server.stdout.removeListener("data", onData);
        resolve();
      }
    });
  });

  server.stdout.on("data", dumpIt);

  server.on("close", code => {
    Assert.ok(!code, "process should've exited normally");
  });

  await callback(server);

  server.kill();
  server.stdout.removeListener("data", dumpIt);
}

const STOP = {};
async function checkServerLogs(server, messages, controller = { stop: null }) {
  let matches = [];
  const dataHandler = data => {
    for (let message of messages) {
      let match = (message instanceof RegExp) ? message.test(data) : data.indexOf(message) > -1;
      if (match) {
        matches.push(data);
      }
      if (matches.length == messages.length) {
        controller.stop = STOP;
        break;
      }
    }
  }
  server.stdout.on("data", dataHandler);

  let breakTimer = setTimeout(() => {
    controller.stop = STOP;
  }, 2000);

  while (true) {
    if (controller.stop && controller.stop === STOP) {
      Assert.equal(matches.length, messages.length, "All expected messages should have passed through.");
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1));
  }

  server.stdout.removeListener("data", dataHandler);
  clearTimeout(breakTimer);

  return matches;
}

async function sendForwardRequest(server, { url, method = "GET", headers = {}, expectedStatusCode = 200, waitForServerLogMessage }) {
  const logsPromise = checkServerLogs(server, [waitForServerLogMessage]);

  let res = await new Promise(resolve => {
    const req = http.request(url, { method, headers }, resolve);
    req.write("");
    req.end();
  });
  // let res = await new Promise(resolve => http.get(url, { headers }, resolve));
  Assert.equal(res.statusCode, expectedStatusCode);

  const data = await new Promise(resolve => {
    res.setEncoding("utf8");
    let rawData = "";
    res.on("data", chunk => rawData += chunk);
    res.on("end", () => {
      resolve(rawData);
    });
  });

  await logsPromise;
  return data;
}

module.exports = { withServer, checkServerLogs, sendForwardRequest , PORT, STOP };
