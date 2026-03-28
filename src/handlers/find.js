'use strict';

const { json, error } = require('../utils/response');

/**
 * POST /find — find elements by CSS selector, XPath, or text content.
 *
 * Body: { tabId?, selector?, xpath?, text?, maxResults? }
 */
function handleFind(cdp, tabs) {
  return async ({ res, body }) => {
    if (!body || (!body.selector && !body.xpath && !body.text)) {
      return error(res, 400, 'bad_request', 'selector, xpath, or text is required');
    }

    const tab = tabs.resolveSession(body.tabId);
    const sid = tab.sessionId;
    const maxResults = body.maxResults || 20;

    let elements = [];

    if (body.selector) {
      // CSS selector
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(function() {
          const els = document.querySelectorAll(${JSON.stringify(body.selector)});
          return Array.from(els).slice(0, ${maxResults}).map((el, i) => ({
            index: i,
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.textContent || '').trim().slice(0, 200),
            attributes: Object.fromEntries(
              Array.from(el.attributes).slice(0, 10).map(a => [a.name, a.value.slice(0, 100)])
            ),
            visible: el.offsetParent !== null || el.tagName === 'BODY',
          }));
        })()`,
        returnByValue: true,
        awaitPromise: false,
      }, sid);
      elements = r.result.value || [];
    } else if (body.xpath) {
      // XPath
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(function() {
          const iter = document.evaluate(${JSON.stringify(body.xpath)}, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const results = [];
          for (let i = 0; i < Math.min(iter.snapshotLength, ${maxResults}); i++) {
            const el = iter.snapshotItem(i);
            if (el.nodeType === 1) {
              results.push({
                index: i,
                tag: el.tagName.toLowerCase(),
                text: (el.innerText || el.textContent || '').trim().slice(0, 200),
                visible: el.offsetParent !== null || el.tagName === 'BODY',
              });
            }
          }
          return results;
        })()`,
        returnByValue: true,
      }, sid);
      elements = r.result.value || [];
    } else if (body.text) {
      // Text content search
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(function() {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          const results = [];
          const searchText = ${JSON.stringify(body.text)}.toLowerCase();
          while (walker.nextNode() && results.length < ${maxResults}) {
            const node = walker.currentNode;
            if (node.textContent.toLowerCase().includes(searchText)) {
              const el = node.parentElement;
              if (el) {
                results.push({
                  index: results.length,
                  tag: el.tagName.toLowerCase(),
                  text: el.innerText?.trim().slice(0, 200) || node.textContent.trim().slice(0, 200),
                  visible: el.offsetParent !== null,
                });
              }
            }
          }
          return results;
        })()`,
        returnByValue: true,
      }, sid);
      elements = r.result.value || [];
    }

    json(res, 200, {
      tabId: tab.targetId,
      count: elements.length,
      elements,
    });
  };
}

module.exports = handleFind;
