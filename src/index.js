#!/usr/bin/env node
require("dotenv").config();
("use strict");

const CDPClient = require("./cdp");
const TabManager = require("./tabs");
const Server = require("./server");

// Handlers
const handleHealth = require("./handlers/health");
const handleNavigate = require("./handlers/navigate");
const handleSnapshot = require("./handlers/snapshot");
const handleAction = require("./handlers/action");
const handleActions = require("./handlers/actions");
const handleText = require("./handlers/text");
const handleScreenshot = require("./handlers/screenshot");
const handleConsole = require("./handlers/console");
const handleNetwork = require("./handlers/network");
const handleEvaluate = require("./handlers/evaluate");
const handleWait = require("./handlers/wait");
const handleFind = require("./handlers/find");
const {
  handleListTabs,
  handleCreateTab,
  handleCloseTab,
} = require("./handlers/tabs");

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  console.log(args);
  const opts = {
    port: 3000,
    debugPort: 9222,
    host: process.env.CLAWTAB_HOST || "0.0.0.0",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--port":
        opts.port = parseInt(args[++i]);
        break;
      case "--debug-port":
        opts.debugPort = parseInt(args[++i]);
        break;
      case "--host":
        opts.host = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
clawtab — Lightweight HTTP-to-CDP bridge for Chrome browser control

Usage:
  clawtab [--port <port>] [--debug-port <port>]

Options:
  --port <port>        HTTP server port (default: 3000)
  --debug-port <port>  Chrome DevTools HTTP port to query (default: 9222)
  --help               Show this help

Environment:
  CLAWTAB_TOKEN        Bearer token for HTTP auth (required)
  CLAWTAB_HOST         Host to bind HTTP server to (default: 0.0.0.0)

Behavior:
  The server will query http://127.0.0.1:<debug-port>/json/version to discover
  Chrome's webSocketDebuggerUrl and attach automatically. If the endpoint is not
  available or does not include a webSocketDebuggerUrl, the process will exit
  with an explanatory message.

Example:
  CLAWTAB_TOKEN=mysecret CLAWTAB_HOST=0.0.0.0 clawtab --debug-port 9222
`);
        process.exit(0);
    }
  }

  return opts;
}

// Fetch Chrome's /json/version and extract webSocketDebuggerUrl
const http = require("http");
function fetchWebSocketDebuggerUrl(
  host = "127.0.0.1",
  port = 9222,
  timeout = 3000,
) {
  const path = "/json/version";
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: host, port, path, timeout }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`unexpected status ${res.statusCode}`));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const obj = JSON.parse(data);
          const ws =
            obj.webSocketDebuggerUrl ||
            obj.webSocketDebuggerURL ||
            obj["webSocketDebuggerUrl"];
          if (ws) return resolve(ws);
          return reject(
            new Error("webSocketDebuggerUrl not found in /json/version"),
          );
        } catch (err) {
          return reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

async function main() {
  const opts = parseArgs();

  if (!process.env.CLAWTAB_TOKEN) {
    console.error(
      "[clawtab] error: CLAWTAB_TOKEN environment variable is required",
    );
    process.exit(1);
  }

  // Discover Chrome's CDP WebSocket URL
  let wsUrl;
  try {
    wsUrl = await fetchWebSocketDebuggerUrl("127.0.0.1", opts.debugPort, 3000);
  } catch (err) {
    console.error(
      "[clawtab] could not discover Chrome DevTools endpoint at http://127.0.0.1:" +
        opts.debugPort +
        "/json/version",
    );
    console.error(
      "[clawtab] Ensure Chrome is running with --remote-debugging-port=" +
        opts.debugPort +
        "",
    );
    process.exit(1);
  }

  console.log(`[clawtab] connecting to Chrome at ${wsUrl}`);

  // Initialize CDP client
  const cdp = new CDPClient(wsUrl);
  try {
    await cdp.connect();
  } catch (err) {
    console.error(`[clawtab] failed to connect to Chrome: ${err.message}`);
    process.exit(1);
  }
  console.log("[clawtab] CDP connection established");

  // Initialize tab manager
  const tabs = new TabManager(cdp);
  await tabs.initialize();
  console.log(`[clawtab] discovered ${tabs.list().length} existing tab(s)`);

  // Initialize HTTP server
  const server = new Server({ port: opts.port, host: opts.host });

  // Register routes
  server.get("/health", handleHealth(server, cdp, tabs));
  server.post("/navigate", handleNavigate(cdp, tabs));
  server.get("/snapshot", handleSnapshot(cdp, tabs));
  server.post("/action", handleAction(cdp, tabs));
  server.post("/actions", handleActions(cdp, tabs));
  server.get("/text", handleText(cdp, tabs));
  server.get("/screenshot", handleScreenshot(cdp, tabs));
  server.get("/console", handleConsole(cdp, tabs));
  server.get("/network", handleNetwork(cdp, tabs));
  server.post("/evaluate", handleEvaluate(cdp, tabs));
  server.post("/wait", handleWait(cdp, tabs));
  server.post("/find", handleFind(cdp, tabs));
  server.get("/tabs", handleListTabs(tabs));
  server.post("/tabs", handleCreateTab(tabs));
  server.del("/tabs/:id", handleCloseTab(tabs));

  await server.listen();
  console.log(
    `[clawtab] server listening on http://${server.host}:${server.port}`,
  );
  console.log(`[clawtab] auth: Bearer token from CLAWTAB_TOKEN`);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[clawtab] ${signal} received, shutting down...`);
    await server.close();
    cdp.close();
    console.log("[clawtab] goodbye");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle CDP disconnection
  cdp.on("close", () => {
    console.error("[clawtab] CDP connection lost");
  });

  cdp.on("error", (err) => {
    console.error(`[clawtab] CDP error: ${err.message}`);
  });
}

main().catch((err) => {
  console.error(`[clawtab] fatal: ${err.message}`);
  process.exit(1);
});
