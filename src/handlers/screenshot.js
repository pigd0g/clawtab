'use strict';

const { json, error } = require('../utils/response');

/**
 * GET /screenshot — capture a PNG screenshot of the page.
 *
 * Query: tabId?, fullPage=true|false, format=png|jpeg|webp, quality=0-100
 */
function handleScreenshot(cdp, tabs) {
  return async ({ req, res, query }) => {
    const tab = tabs.resolveSession(query.tabId);
    const format = query.format || 'png';
    const quality = query.quality ? parseInt(query.quality) : undefined;

    const params = { format };
    if (quality !== undefined && format !== 'png') {
      params.quality = quality;
    }

    // Full page: capture with content size clip
    if (query.fullPage === 'true') {
      const metrics = await cdp.send('Page.getLayoutMetrics', {}, tab.sessionId);
      const { width, height } = metrics.contentSize || metrics.cssContentSize;
      params.clip = { x: 0, y: 0, width, height, scale: 1 };
      params.captureBeyondViewport = true;
    }

    const result = await cdp.send('Page.captureScreenshot', params, tab.sessionId);

    // Check if caller wants binary or base64 JSON
    const accept = req.headers.accept || '';
    if (accept.includes('image/')) {
      const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const buf = Buffer.from(result.data, 'base64');
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': buf.length,
      });
      res.end(buf);
    } else {
      json(res, 200, {
        tabId: tab.targetId,
        format,
        data: result.data,
      });
    }
  };
}

module.exports = handleScreenshot;
