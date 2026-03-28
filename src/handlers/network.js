'use strict';

const { json } = require('../utils/response');

/**
 * GET /network — get captured network request entries.
 *
 * Query: tabId?, clear=true|false
 */
function handleNetwork(cdp, tabs) {
  return async ({ res, query }) => {
    const tab = tabs.resolveSession(query.tabId);
    const entries = tabs.getNetworkLogs(tab.targetId);

    if (query.clear === 'true') {
      tabs.clearNetworkLogs(tab.targetId);
    }

    json(res, 200, {
      tabId: tab.targetId,
      entries,
    });
  };
}

module.exports = handleNetwork;
