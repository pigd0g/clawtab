'use strict';

const http = require('http');
const { json, error } = require('./utils/response');
const { readJson, parseQuery } = require('./utils/parse');

/**
 * HTTP server with routing and Bearer token auth.
 */
class Server {
  constructor(opts = {}) {
    this.port = opts.port || 3000;
    this.host = opts.host || '127.0.0.1';
    this.routes = { GET: {}, POST: {}, DELETE: {} };
    this._server = null;
    this._startTime = Date.now();
  }

  /** Register a route handler. */
  on(method, path, handler) {
    this.routes[method.toUpperCase()][path] = handler;
  }

  /** GET shorthand. */
  get(path, handler) { this.on('GET', path, handler); }

  /** POST shorthand. */
  post(path, handler) { this.on('POST', path, handler); }

  /** DELETE shorthand. */
  del(path, handler) { this.on('DELETE', path, handler); }

  /** Start listening. */
  listen() {
    return new Promise((resolve) => {
      this._server = http.createServer((req, res) => this._handle(req, res));
      this._server.listen(this.port, this.host, () => resolve());
    });
  }

  /** Graceful shutdown. */
  close() {
    return new Promise((resolve) => {
      if (this._server) this._server.close(resolve);
      else resolve();
    });
  }

  get uptime() {
    return Date.now() - this._startTime;
  }

  /** Main request handler. */
  async _handle(req, res) {
    // Auth check
    if (!this._auth(req, res)) return;

    // Parse URL path and query
    const urlPath = req.url.split('?')[0];
    const query = parseQuery(req.url);
    const method = req.method.toUpperCase();

    // Try exact match first
    let handler = this.routes[method]?.[urlPath];

    // Try pattern match for /tabs/:id
    let params = {};
    if (!handler) {
      const match = this._matchRoute(method, urlPath);
      if (match) {
        handler = match.handler;
        params = match.params;
      }
    }

    if (!handler) {
      return error(res, 404, 'not_found', `${method} ${urlPath} not found`);
    }

    try {
      const body = await readJson(req);
      await handler({ req, res, query, body, params });
    } catch (err) {
      if (err.message === 'invalid JSON body') {
        return error(res, 400, 'bad_request', 'invalid JSON body');
      }
      console.error(`[clawtab] ${method} ${urlPath} error:`, err.message);
      error(res, 500, 'internal_error', err.message);
    }
  }

  /** Validate Bearer token. */
  _auth(req, res) {
    const token = process.env.CLAWTAB_TOKEN;
    if (!token) {
      error(res, 500, 'server_error', 'CLAWTAB_TOKEN not configured');
      return false;
    }

    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${token}`) {
      error(res, 401, 'unauthorized', 'invalid or missing Bearer token');
      return false;
    }
    return true;
  }

  /** Match routes with path parameters (e.g. /tabs/:id). */
  _matchRoute(method, urlPath) {
    const routes = this.routes[method];
    if (!routes) return null;

    for (const [pattern, handler] of Object.entries(routes)) {
      if (!pattern.includes(':')) continue;

      const patternParts = pattern.split('/');
      const urlParts = urlPath.split('/');
      if (patternParts.length !== urlParts.length) continue;

      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
          params[patternParts[i].slice(1)] = urlParts[i];
        } else if (patternParts[i] !== urlParts[i]) {
          match = false;
          break;
        }
      }

      if (match) return { handler, params };
    }
    return null;
  }
}

module.exports = Server;
