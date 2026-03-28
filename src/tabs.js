'use strict';

const RingBuffer = require('./utils/ring-buffer');

/**
 * Tab management via CDP Target domain.
 * Tracks sessions, console logs, and network requests per tab.
 */
class TabManager {
  constructor(cdp) {
    this.cdp = cdp;
    /** @type {Map<string, { targetId: string, sessionId: string, url: string, title: string }>} */
    this.tabs = new Map();
    /** @type {Map<string, RingBuffer>} tabId → console entries */
    this.consoleLogs = new Map();
    /** @type {Map<string, RingBuffer>} tabId → network entries */
    this.networkLogs = new Map();

    this._maxLogEntries = 1000;
    this._setupEventListeners();
  }

  /** Initialize: discover existing targets and set up auto-attach. */
  async initialize() {
    // Enable target discovery
    await this.cdp.send('Target.setDiscoverTargets', { discover: true });

    // Auto-attach to new targets for session-level commands
    await this.cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });

    // Get existing page targets
    const { targetInfos } = await this.cdp.send('Target.getTargets');
    for (const t of targetInfos) {
      if (t.type === 'page') {
        // Attach to get a session ID
        try {
          const { sessionId } = await this.cdp.send('Target.attachToTarget', {
            targetId: t.targetId,
            flatten: true,
          });
          this._registerTab(t.targetId, sessionId, t.url, t.title);
          await this._enableCapture(sessionId, t.targetId);
        } catch {
          // Already attached — will be picked up via events
        }
      }
    }
  }

  /** Create a new tab, optionally navigating to a URL. */
  async create(url = 'about:blank') {
    const { targetId } = await this.cdp.send('Target.createTarget', { url });
    // Session arrives via attachedToTarget event (auto-attach is on)
    // Wait briefly for the session to be established
    await this._waitForSession(targetId, 5000);
    const tab = this.tabs.get(targetId);
    if (tab) {
      tab.url = url;
    }
    return tab;
  }

  /** Close a tab by targetId. */
  async close(targetId) {
    await this.cdp.send('Target.closeTarget', { targetId });
    this.tabs.delete(targetId);
    this.consoleLogs.delete(targetId);
    this.networkLogs.delete(targetId);
  }

  /** List all tracked tabs. */
  list() {
    return Array.from(this.tabs.values());
  }

  /** Get tab info by targetId. */
  get(targetId) {
    return this.tabs.get(targetId) || null;
  }

  /** Get session ID for a tab, or the first tab if no ID given. */
  resolveSession(tabId) {
    if (tabId) {
      const tab = this.tabs.get(tabId);
      if (!tab) throw new Error(`tab not found: ${tabId}`);
      return tab;
    }
    // Default to first tab
    const first = this.tabs.values().next().value;
    if (!first) throw new Error('no tabs available');
    return first;
  }

  /** Get console logs for a tab. */
  getConsoleLogs(tabId) {
    const buf = this.consoleLogs.get(tabId);
    return buf ? buf.toArray() : [];
  }

  /** Clear console logs for a tab. */
  clearConsoleLogs(tabId) {
    const buf = this.consoleLogs.get(tabId);
    if (buf) buf.clear();
  }

  /** Get network logs for a tab. */
  getNetworkLogs(tabId) {
    const buf = this.networkLogs.get(tabId);
    return buf ? buf.toArray() : [];
  }

  /** Clear network logs for a tab. */
  clearNetworkLogs(tabId) {
    const buf = this.networkLogs.get(tabId);
    if (buf) buf.clear();
  }

  /** Register a tab in our tracking map. */
  _registerTab(targetId, sessionId, url, title) {
    this.tabs.set(targetId, { targetId, sessionId, url: url || '', title: title || '' });
    if (!this.consoleLogs.has(targetId)) {
      this.consoleLogs.set(targetId, new RingBuffer(this._maxLogEntries));
    }
    if (!this.networkLogs.has(targetId)) {
      this.networkLogs.set(targetId, new RingBuffer(this._maxLogEntries));
    }
  }

  /** Enable console and network capture for a session. */
  async _enableCapture(sessionId, targetId) {
    try {
      await this.cdp.send('Runtime.enable', {}, sessionId);
      await this.cdp.send('Network.enable', {}, sessionId);
    } catch (err) {
      console.error(`[clawtab] capture enable failed for ${targetId}:`, err.message);
    }
  }

  /** Wait for a session to be established for a target. */
  _waitForSession(targetId, timeout) {
    return new Promise((resolve, reject) => {
      if (this.tabs.has(targetId)) return resolve();
      const timer = setTimeout(() => {
        reject(new Error(`timeout waiting for session on target ${targetId}`));
      }, timeout);
      const check = () => {
        if (this.tabs.has(targetId)) {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  /** Set up CDP event listeners for target and runtime events. */
  _setupEventListeners() {
    // New target attached — register session
    this.cdp.on('Target.attachedToTarget', (params) => {
      const { sessionId, targetInfo } = params;
      if (targetInfo.type === 'page') {
        this._registerTab(targetInfo.targetId, sessionId, targetInfo.url, targetInfo.title);
        this._enableCapture(sessionId, targetInfo.targetId).catch(() => {});
      }
    });

    // Target detached
    this.cdp.on('Target.detachedFromTarget', (params) => {
      const { targetId } = params;
      if (targetId) {
        this.tabs.delete(targetId);
        this.consoleLogs.delete(targetId);
        this.networkLogs.delete(targetId);
      }
    });

    // Target info changed (URL/title updates)
    this.cdp.on('Target.targetInfoChanged', (params) => {
      const { targetInfo } = params;
      const tab = this.tabs.get(targetInfo.targetId);
      if (tab) {
        tab.url = targetInfo.url;
        tab.title = targetInfo.title;
      }
    });

    // Target destroyed
    this.cdp.on('Target.targetDestroyed', (params) => {
      this.tabs.delete(params.targetId);
      this.consoleLogs.delete(params.targetId);
      this.networkLogs.delete(params.targetId);
    });

    // Console API calls — route to correct tab by sessionId
    this.cdp.on('Runtime.consoleAPICalled', (params, sessionId) => {
      const tab = this._findTabBySession(sessionId);
      if (!tab) return;
      const buf = this.consoleLogs.get(tab.targetId);
      if (buf) {
        buf.push({
          type: params.type,
          args: params.args.map((a) => a.value !== undefined ? a.value : a.description || a.type),
          timestamp: params.timestamp,
        });
      }
    });

    // Uncaught exceptions
    this.cdp.on('Runtime.exceptionThrown', (params, sessionId) => {
      const tab = this._findTabBySession(sessionId);
      if (!tab) return;
      const buf = this.consoleLogs.get(tab.targetId);
      if (buf) {
        const ex = params.exceptionDetails;
        buf.push({
          type: 'error',
          args: [ex.text || 'Uncaught exception'],
          timestamp: params.timestamp,
        });
      }
    });

    // Network request will be sent
    this.cdp.on('Network.requestWillBeSent', (params, sessionId) => {
      const tab = this._findTabBySession(sessionId);
      if (!tab) return;
      const buf = this.networkLogs.get(tab.targetId);
      if (buf) {
        buf.push({
          requestId: params.requestId,
          method: params.request.method,
          url: params.request.url,
          type: params.type,
          timestamp: params.timestamp,
          status: null,
        });
      }
    });

    // Network response received — update matching request
    this.cdp.on('Network.responseReceived', (params, sessionId) => {
      const tab = this._findTabBySession(sessionId);
      if (!tab) return;
      const buf = this.networkLogs.get(tab.targetId);
      if (buf) {
        const entries = buf.toArray();
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].requestId === params.requestId) {
            entries[i].status = params.response.status;
            entries[i].mimeType = params.response.mimeType;
            break;
          }
        }
      }
    });
  }

  /** Find a tab by its CDP session ID. */
  _findTabBySession(sessionId) {
    for (const tab of this.tabs.values()) {
      if (tab.sessionId === sessionId) return tab;
    }
    return null;
  }
}

module.exports = TabManager;
