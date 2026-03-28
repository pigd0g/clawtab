'use strict';

const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * CDP WebSocket client with command multiplexing and event subscriptions.
 * Maintains a single WebSocket connection and routes responses/events.
 */
class CDPClient extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this.ws = null;
    this._nextId = 1;
    this._pending = new Map(); // id → { resolve, reject, timer }
    this._connected = false;
  }

  get connected() {
    return this._connected;
  }

  /** Connect to the Chrome DevTools WebSocket. */
  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false });

      this.ws.on('open', () => {
        this._connected = true;
        this.emit('open');
        resolve();
      });

      this.ws.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Response to a command
        if (msg.id !== undefined) {
          const p = this._pending.get(msg.id);
          if (p) {
            this._pending.delete(msg.id);
            clearTimeout(p.timer);
            if (msg.error) {
              p.reject(new Error(`CDP error: ${msg.error.message} (${msg.error.code})`));
            } else {
              p.resolve(msg.result || {});
            }
          }
          return;
        }

        // Event
        if (msg.method) {
          this.emit(msg.method, msg.params, msg.sessionId);
        }
      });

      this.ws.on('close', () => {
        this._connected = false;
        // Reject all pending commands
        for (const [id, p] of this._pending) {
          clearTimeout(p.timer);
          p.reject(new Error('WebSocket closed'));
        }
        this._pending.clear();
        this.emit('close');
      });

      this.ws.on('error', (err) => {
        this._connected = false;
        this.emit('error', err);
        reject(err);
      });
    });
  }

  /**
   * Send a CDP command and wait for the response.
   * @param {string} method - CDP method (e.g. 'Page.navigate')
   * @param {object} params - Command parameters
   * @param {string} [sessionId] - Target session ID for per-tab commands
   * @param {number} [timeout=30000] - Timeout in ms
   * @returns {Promise<object>} CDP response result
   */
  send(method, params = {}, sessionId = null, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!this._connected) {
        return reject(new Error('CDP client not connected'));
      }

      const id = this._nextId++;
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;

      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`CDP command timeout: ${method} (${timeout}ms)`));
      }, timeout);

      this._pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(msg));
    });
  }

  /** Close the WebSocket connection. */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this._connected = false;
    }
  }
}

module.exports = CDPClient;
