'use strict';

const { json, error } = require('../utils/response');

/**
 * POST /wait — wait for a condition to be met.
 *
 * Body: { tabId?, selector?, text?, timeout? }
 *
 * Waits for:
 * - selector: CSS selector to appear in DOM
 * - text: text to appear on page
 * If neither specified, waits for page load (document.readyState === 'complete')
 */
function handleWait(cdp, tabs) {
  return async ({ res, body }) => {
    const tab = tabs.resolveSession(body?.tabId);
    const timeout = body?.timeout || 30000;
    const start = Date.now();

    if (body?.selector) {
      // Poll for selector presence
      while (Date.now() - start < timeout) {
        const r = await cdp.send('Runtime.evaluate', {
          expression: `!!document.querySelector(${JSON.stringify(body.selector)})`,
          returnByValue: true,
        }, tab.sessionId);
        if (r.result.value === true) {
          return json(res, 200, { tabId: tab.targetId, matched: 'selector', selector: body.selector });
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return error(res, 408, 'timeout', `selector not found within ${timeout}ms: ${body.selector}`);
    }

    if (body?.text) {
      // Poll for text presence
      while (Date.now() - start < timeout) {
        const r = await cdp.send('Runtime.evaluate', {
          expression: `(document.body?.innerText || '').includes(${JSON.stringify(body.text)})`,
          returnByValue: true,
        }, tab.sessionId);
        if (r.result.value === true) {
          return json(res, 200, { tabId: tab.targetId, matched: 'text', text: body.text });
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return error(res, 408, 'timeout', `text not found within ${timeout}ms: ${body.text}`);
    }

    // Default: wait for page load
    while (Date.now() - start < timeout) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      }, tab.sessionId);
      if (r.result.value === 'complete') {
        return json(res, 200, { tabId: tab.targetId, matched: 'load' });
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return error(res, 408, 'timeout', `page did not finish loading within ${timeout}ms`);
  };
}

module.exports = handleWait;
