'use strict';

const { json } = require('../utils/response');

/**
 * GET /console — get captured console log entries.
 *
 * Query: tabId?, clear=true|false
 */
function handleConsole(cdp, tabs) {
  return async ({ res, query }) => {
    const tab = tabs.resolveSession(query.tabId);
    const entries = tabs.getConsoleLogs(tab.targetId);

    if (query.clear === 'true') {
      tabs.clearConsoleLogs(tab.targetId);
    }

    json(res, 200, {
      tabId: tab.targetId,
      entries,
    });
  };
}

module.exports = handleConsole;
