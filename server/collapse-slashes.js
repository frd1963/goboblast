"use strict";

/**
 * nginx-proxy with VIRTUAL_DEST=/ rewrites /gobo/ to an upstream URL of //
 * and /gobo/_next/... to //_next/.... Next answers any repeated slash with
 * 308 Location: /, which drops the browser on the host root. Collapse the
 * slashes before Next sees the request so the response stays on /gobo/.
 */
const http = require("http");

const emit = http.Server.prototype.emit;

http.Server.prototype.emit = function (event, req, ...rest) {
  if (event === "request" && req && typeof req.url === "string" && req.url.includes("//")) {
    const queryAt = req.url.indexOf("?");
    const path = queryAt === -1 ? req.url : req.url.slice(0, queryAt);
    const query = queryAt === -1 ? "" : req.url.slice(queryAt);
    let collapsed = path.replace(/\/{2,}/g, "/");
    if (!collapsed.startsWith("/")) collapsed = `/${collapsed}`;
    req.url = (collapsed || "/") + query;
  }
  return emit.call(this, event, req, ...rest);
};
