'use strict';

/**
 * Read and parse JSON body from an incoming request.
 * Returns the parsed object or null for empty bodies.
 */
function readJson(req) {
  return new Promise((resolve, reject) => {
    // GET/DELETE/HEAD typically have no body
    if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') {
      return resolve(null);
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse query string from URL into an object.
 */
function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const params = new URLSearchParams(url.slice(idx));
  const obj = {};
  for (const [k, v] of params) obj[k] = v;
  return obj;
}

module.exports = { readJson, parseQuery };
