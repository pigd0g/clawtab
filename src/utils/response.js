'use strict';

/** Send a JSON response. */
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Send a JSON error response. */
function error(res, status, code, message) {
  json(res, status, { error: code, message });
}

module.exports = { json, error };
