'use strict';

const { json, error } = require('../utils/response');
const { executeAction } = require('./action');

/**
 * POST /actions — execute a batch of sequential actions.
 *
 * Body: { tabId?, actions: [{ kind, ... }], timeout? }
 */
function handleActions(cdp, tabs) {
  return async ({ res, body }) => {
    if (!body || !Array.isArray(body.actions)) {
      return error(res, 400, 'bad_request', 'actions array is required');
    }

    const results = [];
    for (let i = 0; i < body.actions.length; i++) {
      const action = { ...body.actions[i], tabId: body.actions[i].tabId || body.tabId };
      try {
        const result = await executeAction(cdp, tabs, action);
        results.push({ index: i, success: true, ...result });
      } catch (err) {
        results.push({ index: i, success: false, error: err.message });
        // Stop on first failure unless continueOnError is set
        if (!body.continueOnError) break;
      }
    }

    json(res, 200, {
      tabId: body.tabId || tabs.resolveSession(body.tabId)?.targetId,
      results,
    });
  };
}

module.exports = handleActions;
