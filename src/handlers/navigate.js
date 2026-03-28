'use strict';

const { json, error } = require('../utils/response');

/**
 * POST /navigate — navigate a tab to a URL.
 *
 * Body: { tabId?, url, newTab?, timeout?, waitFor? }
 * waitFor: "load" | "domcontentloaded" | "networkidle"
 */
function handleNavigate(cdp, tabs) {
  return async ({ res, body }) => {
    if (!body || !body.url) {
      return error(res, 400, 'bad_request', 'url is required');
    }

    const timeout = body.timeout || 30000;
    let tab;

    // Create new tab or use existing
    if (body.newTab) {
      tab = await tabs.create(body.url);
    } else {
      tab = tabs.resolveSession(body.tabId);
      await cdp.send('Page.navigate', { url: body.url }, tab.sessionId, timeout);
    }

    // Wait for page load
    if (body.waitFor !== 'none') {
      await _waitForLoad(cdp, tab, body.waitFor || 'load', timeout);
    }

    // Get updated info
    const result = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ url: location.href, title: document.title })',
      returnByValue: true,
    }, tab.sessionId);

    const info = JSON.parse(result.result.value);
    tab.url = info.url;
    tab.title = info.title;

    json(res, 200, {
      tabId: tab.targetId,
      url: info.url,
      title: info.title,
    });
  };
}

async function _waitForLoad(cdp, tab, strategy, timeout) {
  const start = Date.now();

  if (strategy === 'domcontentloaded' || strategy === 'load') {
    // Poll readyState
    const target = strategy === 'load' ? 'complete' : 'interactive';
    while (Date.now() - start < timeout) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      }, tab.sessionId);

      const state = r.result.value;
      if (state === 'complete' || (target === 'interactive' && state !== 'loading')) {
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  } else if (strategy === 'networkidle') {
    // Wait for no new network requests for 500ms
    let lastActivity = Date.now();
    const checkIdle = async () => {
      while (Date.now() - start < timeout) {
        const elapsed = Date.now() - lastActivity;
        if (elapsed >= 500) return;
        await new Promise((r) => setTimeout(r, 100));
      }
    };

    // Also wait for at least interactive
    await _waitForLoad(cdp, tab, 'domcontentloaded', timeout);
    await checkIdle();
  }
}

module.exports = handleNavigate;
