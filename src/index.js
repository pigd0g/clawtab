#!/usr/bin/env node
'use strict';

require('dotenv').config();

const http = require('http');
const chromeLauncher = require('chrome-launcher');

const CDPClient = require('./cdp');
const TabManager = require('./tabs');
const Server = require('./server');
const { resolveToken } = require('./token');

// Handlers
const handleHealth = require('./handlers/health');
const handleNavigate = require('./handlers/navigate');
const handleSnapshot = require('./handlers/snapshot');
const handleAction = require('./handlers/action');
const handleActions = require('./handlers/actions');
const handleText = require('./handlers/text');
const handleScreenshot = require('./handlers/screenshot');
const handleConsole = require('./handlers/console');
const handleNetwork = require('./handlers/network');
const handleEvaluate = require('./handlers/evaluate');
const handleWait = require('./handlers/wait');
const handleFind = require('./handlers/find');
const {
  handleListTabs,
  handleCreateTab,
  handleCloseTab,
} = require('./handlers/tabs');

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    port: 3000,
    debugPort: 9222,
    host: process.env.CLAWTAB_HOST || '0.0.0.0',
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--port':
        opts.port = parseInt(argv[++i], 10);
        break;
      case '--debug-port':
        opts.debugPort = parseInt(argv[++i], 10);
        break;
      case '--host':
        opts.host = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${argv[i]}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
clawtab — Lightweight HTTP-to-CDP bridge for Chrome browser control

Usage:
  clawtab [--port <port>] [--debug-port <port>] [--host <host>]

Options:
  --port <port>        HTTP server port (default: 3000)
  --debug-port <port>  Chrome DevTools port (default: 9222)
  --host <host>        HTTP bind host (default: 0.0.0.0)
  --help               Show this help

Token resolution order:
  1. CLAWTAB_TOKEN environment variable
  2. ~/.clawtab/config.json
  3. Generate a new token and save it to ~/.clawtab/config.json

Behavior:
  - Reuses an existing Chrome/Chromium instance on the debug port when available.
  - Otherwise launches Chrome/Chromium automatically with remote debugging enabled.
  - All HTTP requests require: Authorization: Bearer <token>

Examples:
  npx clawtab --port 3000 --debug-port 9222
  CLAWTAB_TOKEN=mysecret clawtab --host 0.0.0.0
`);
}

function fetchWebSocketDebuggerUrl(host = '127.0.0.1', port = 9222, timeout = 3000) {
  const path = '/json/version';
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: host, port, path, timeout }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`unexpected status ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const obj = JSON.parse(data);
          const ws = obj.webSocketDebuggerUrl || obj.webSocketDebuggerURL;
          if (!ws) {
            return reject(new Error('webSocketDebuggerUrl not found in /json/version'));
          }
          return resolve(ws);
        } catch (err) {
          return reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function ensureChrome(debugPort) {
  try {
    const wsUrl = await fetchWebSocketDebuggerUrl('127.0.0.1', debugPort, 1500);
    return { wsUrl, chrome: null, launched: false };
  } catch {
    const chrome = await chromeLauncher.launch({
      port: debugPort,
      chromeFlags: [
        '--remote-allow-origins=*',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    const wsUrl = await fetchWebSocketDebuggerUrl('127.0.0.1', debugPort, 10000);
    return { wsUrl, chrome, launched: true };
  }
}

async function main(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const opts = parseArgs(argv);

  const tokenInfo = options.tokenInfo || resolveToken();
  process.env.CLAWTAB_TOKEN = tokenInfo.token;

  if (tokenInfo.source === 'env') {
    console.log('[clawtab] using token from CLAWTAB_TOKEN environment variable');
  } else if (tokenInfo.source === 'config') {
    console.log(`[clawtab] using token from ${tokenInfo.configPath}`);
  } else {
    console.log(`[clawtab] generated new token and saved it to ${tokenInfo.configPath}`);
    console.log(`[clawtab] token: ${tokenInfo.token}`);
  }

  let wsUrl;
  let chrome = null;
  let server = null;
  let cdp = null;
  let shuttingDown = false;

  try {
    if (options.launchChrome) {
      const chromeInfo = await ensureChrome(opts.debugPort);
      wsUrl = chromeInfo.wsUrl;
      chrome = chromeInfo.chrome;

      if (chromeInfo.launched) {
        console.log(`[clawtab] launched Chrome with remote debugging on port ${opts.debugPort}`);
      } else {
        console.log(`[clawtab] reusing Chrome on remote debugging port ${opts.debugPort}`);
      }
    } else {
      wsUrl = await fetchWebSocketDebuggerUrl('127.0.0.1', opts.debugPort, 3000);
      console.log(`[clawtab] discovered Chrome on remote debugging port ${opts.debugPort}`);
    }
  } catch (err) {
    console.error(
      `[clawtab] could not initialize Chrome DevTools on http://127.0.0.1:${opts.debugPort}/json/version`,
    );
    console.error(`[clawtab] ${err.message}`);
    process.exit(1);
  }

  console.log(`[clawtab] connecting to Chrome at ${wsUrl}`);

  cdp = new CDPClient(wsUrl);
  try {
    await cdp.connect();
  } catch (err) {
    console.error(`[clawtab] failed to connect to Chrome: ${err.message}`);
    if (chrome) {
      await chrome.kill();
    }
    process.exit(1);
  }
  console.log('[clawtab] CDP connection established');

  const tabs = new TabManager(cdp);
  await tabs.initialize();
  console.log(`[clawtab] discovered ${tabs.list().length} existing tab(s)`);

  server = new Server({ port: opts.port, host: opts.host });
  server.get('/health', handleHealth(server, cdp, tabs));
  server.post('/navigate', handleNavigate(cdp, tabs));
  server.get('/snapshot', handleSnapshot(cdp, tabs));
  server.post('/action', handleAction(cdp, tabs));
  server.post('/actions', handleActions(cdp, tabs));
  server.get('/text', handleText(cdp, tabs));
  server.get('/screenshot', handleScreenshot(cdp, tabs));
  server.get('/console', handleConsole(cdp, tabs));
  server.get('/network', handleNetwork(cdp, tabs));
  server.post('/evaluate', handleEvaluate(cdp, tabs));
  server.post('/wait', handleWait(cdp, tabs));
  server.post('/find', handleFind(cdp, tabs));
  server.get('/tabs', handleListTabs(tabs));
  server.post('/tabs', handleCreateTab(tabs));
  server.del('/tabs/:id', handleCloseTab(tabs));

  await server.listen();
  console.log(`[clawtab] server listening on http://${server.host}:${server.port}`);
  console.log(`[clawtab] auth: Bearer token from ${tokenInfo.source === 'env' ? 'CLAWTAB_TOKEN' : tokenInfo.configPath}`);

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[clawtab] ${signal} received, shutting down...`);

    if (server) {
      await server.close();
    }
    if (cdp) {
      cdp.close();
    }
    if (chrome) {
      await chrome.kill();
    }

    console.log('[clawtab] goodbye');
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((err) => {
      console.error(`[clawtab] shutdown error: ${err.message}`);
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((err) => {
      console.error(`[clawtab] shutdown error: ${err.message}`);
      process.exit(1);
    });
  });

  cdp.on('close', () => {
    console.error('[clawtab] CDP connection lost');
  });

  cdp.on('error', (err) => {
    console.error(`[clawtab] CDP error: ${err.message}`);
  });

  return { server, cdp, tabs, chrome, opts, tokenInfo };
}

if (require.main === module) {
  main({ argv: process.argv.slice(2), launchChrome: false }).catch((err) => {
    console.error(`[clawtab] fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  printHelp,
  fetchWebSocketDebuggerUrl,
  ensureChrome,
  main,
};
