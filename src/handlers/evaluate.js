'use strict';

const { json, error } = require('../utils/response');

/**
 * POST /evaluate — execute JavaScript in page context.
 *
 * Body: { tabId?, expression, awaitPromise?, returnByValue? }
 */
function handleEvaluate(cdp, tabs) {
  return async ({ res, body }) => {
    if (!body || !body.expression) {
      return error(res, 400, 'bad_request', 'expression is required');
    }

    const tab = tabs.resolveSession(body.tabId);
    const params = {
      expression: body.expression,
      returnByValue: body.returnByValue !== false,
      awaitPromise: body.awaitPromise || false,
      userGesture: true,
    };

    const result = await cdp.send('Runtime.evaluate', params, tab.sessionId);

    if (result.exceptionDetails) {
      return json(res, 200, {
        tabId: tab.targetId,
        error: result.exceptionDetails.text || 'evaluation error',
        exception: result.exceptionDetails.exception?.description,
      });
    }

    json(res, 200, {
      tabId: tab.targetId,
      result: result.result.value,
      type: result.result.type,
    });
  };
}

module.exports = handleEvaluate;
