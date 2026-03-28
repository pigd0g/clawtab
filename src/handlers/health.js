'use strict';

const { json } = require('../utils/response');

/**
 * GET /health — server and CDP connection status.
 */
function handleHealth(server, cdp, tabs) {
  return async ({ res }) => {
    json(res, 200, {
      status: cdp.connected ? 'ok' : 'degraded',
      uptime: server.uptime,
      cdp: {
        connected: cdp.connected,
        url: cdp.wsUrl,
      },
      tabs: tabs.list().length,
    });
  };
}

module.exports = handleHealth;
