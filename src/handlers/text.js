'use strict';

const { json } = require('../utils/response');

/**
 * GET /text — extract visible text content from a page.
 *
 * Query: tabId?
 */
function handleText(cdp, tabs) {
  return async ({ res, query }) => {
    const tab = tabs.resolveSession(query.tabId);

    const result = await cdp.send('Runtime.evaluate', {
      expression: 'document.body?.innerText || ""',
      returnByValue: true,
    }, tab.sessionId);

    json(res, 200, {
      tabId: tab.targetId,
      text: result.result.value || '',
    });
  };
}

module.exports = handleText;
