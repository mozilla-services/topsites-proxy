/*
 * This module is inspired heavily by https://github.com/http-party/node-http-proxy,
 * since forwarding an HTTP request is _very_ similar to how a proxy works.
 * We're not using the `http-proxy` module, because we have a very specific
 * concern to _only_ send bits over the wire that are absolutely essential to
 * tie the knots between A --> B --> C.
 * You could say that this module is an attempt at keeping only the best parts
 * of `http-proxy`.
 */

const http = require("http");
const https = require("https");
const URL = require("url").URL;

const REQUEST_PROPS_TOCOPY = [
  "host",
  "hostname",
  "socketPath",
  "pfx",
  "key",
  "passphrase",
  "cert",
  "ca",
  "ciphers",
  "secureProtocol",
];
const HEADER_UPGRADE_RE = /(^|,)\s*upgrade\s*($|,)/i;

const PROTOCOL_PORT_MAP = new Map([
  ["http", 80],
  ["ws", 80],
  ["https", 443],
  ["wss", 443],
]);

/**
 * Check if we're required to add a port number.
 *
 * @see https://url.spec.whatwg.org/#default-port
 * @param {Number|String} port Port number we need to check
 * @param {String} protocol Protocol we need to check against.
 * @returns {Boolean} Is it a default port for the given protocol
 */
function isPortRequired(port, protocol) {
  protocol = protocol.split(":")[0];
  port = +port;

  if (!port) {
    return false;
  }

  if (PROTOCOL_PORT_MAP.has(protocol)) {
    return PROTOCOL_PORT_MAP.get(protocol);
  }

  return port !== 0;
}

/**
 * Check the host and see if it potentially has a port in it (keep it simple)
 *
 * @returns {Boolean} Whether we have one or not
 *
 * @api private
 */
function hasPort(host) {
  return !!~host.indexOf(":");
}

/**
 * Compile options to pass along to the HTTP(S) request constructor.
 *
 * @param {ClientRequest} req  Original incoming request
 * @param {Object} url Parsed URL object of the target to forward to
 * @param {Object} options [Optional dictionary of predefined options]
 * @return {Object}
 */
function getRequestOptions(req, url, options = {}) {
  let isSecure = url.protocol == "https:";
  options.port = url.port || (isSecure ? 443 : 80);
  options.method = req.method;
  options.path = url.path || "";
  options.headers = options.headers || {};
  for (let prop of REQUEST_PROPS_TOCOPY) {
    options[prop] = url[prop];
  }
  // Intently change the origin of the request to match that of this server.
  options.headers.host =
    isPortRequired(options.port, url.protocol) && !hasPort(options.host)
      ? options.host + ":" + options.port
      : options.host;

  if (isSecure) {
    options.rejectUnauthorized = true;
  }
  options.agent = false;
  // Remark: If we are false and not upgrading, set the connection: close. This is the right thing to do
  // as node core doesn't handle this COMPLETELY properly yet.
  if (
    typeof options.headers.connection != "string" ||
    !HEADER_UPGRADE_RE.test(options.headers.connection)
  ) {
    options.headers.connection = "close";
  }
  return options;
}

/**
 * Setup an HTTP(S) response that will carry the payload of the forwarded response
 * back to the client.
 *
 * @param {ClientRequest} req Original incoming request
 * @param {IncomingMessage} res Original requests' response
 * @param {IncomingMessage} forwardRes Response of the forwarded request
 */
function setupResponse(req, res, forwardRes) {
  if (req.httpVersion == "1.0") {
    // If it's an HTTP 1.0 request, remove chunk headers.
    delete forwardRes.headers["transfer-encoding"];
    // If it's an HTTP 1.0 request, set the correct connection header or when
    // the connection header is not present, then use `keep-alive`.
    forwardRes.headers.connection = req.headers.connection || "close";
  } else if (req.httpVersion != "2.0" && !forwardRes.headers.connection) {
    forwardRes.headers.connection = req.headers.connection || "keep-alive";
  }

  // Copy headers from forwardResponse to the original response and set each
  // header in the response object.
  for (let name of Object.keys(forwardRes.headers)) {
    let value = forwardRes.headers[name];
    // Don't send cookie-related or empty headers back.
    if (name.indexOf("cookie") > -1 || value === undefined) {
      continue;
    }
    res.setHeader(String(name).trim(), value);
  }

  // Set the statusCode from the forwardResponse.
  let statusCode = forwardRes.statusCode;
  // Map redirects to an OK status code, since we don't want the client to follow
  // redirects.
  if (statusCode > 300 && statusCode < 310) {
    statusCode = 200;
  }
  res.statusCode = statusCode;
  if (forwardRes.statusMessage) {
    res.statusMessage = forwardRes.statusMessage;
  }
}

function createErrorHandler(req, forwardReq, url) {
  return function proxyError(err) {
    if (req.socket.destroyed && err.code == "ECONNRESET") {
      return forwardReq.abort();
    }
    return undefined;
  };
}

module.exports = function forwardRequest(req, res, options) {
  let url = new URL(options.target);
  let isSecure = url.protocol == "https:";
  let forwardReq = (isSecure ? https : http).request(
    getRequestOptions(req, url, options)
  );

  // Allow outgoing socket to timeout so that we could show an error page at the initial request.
  if (options.proxyTimeout) {
    forwardReq.setTimeout(options.proxyTimeout, function () {
      forwardReq.abort();
    });
  }

  // Ensure we abort the forwarded request if request is aborted.
  req.on("aborted", function () {
    forwardReq.abort();
  });

  // Handle errors in forwarded and incoming request.
  let onError = createErrorHandler(req, forwardReq, options.target);
  req.on("error", onError);
  forwardReq.on("error", onError);

  req.pipe(forwardReq);

  forwardReq.on("response", function (forwardRes) {
    if (!res.headersSent) {
      setupResponse(req, res, forwardRes, options);
    }

    if (res.finished) {
      return;
    }

    forwardRes.pipe(res);
  });
};
