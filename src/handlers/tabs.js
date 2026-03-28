'use strict';

const { json, error } = require('../utils/response');

/**
 * Tab management endpoints.
 *
 * GET    /tabs       — list all tabs
 * POST   /tabs       — create new tab { url? }
 * DELETE /tabs/:id   — close tab
 */

function handleListTabs(tabs) {
  return async ({ res }) => {
    json(res, 200, { tabs: tabs.list() });
  };
}

function handleCreateTab(tabs) {
  return async ({ res, body }) => {
    const url = body?.url || 'about:blank';
    const tab = await tabs.create(url);
    json(res, 201, tab);
  };
}

function handleCloseTab(tabs) {
  return async ({ res, params }) => {
    const id = params.id;
    const tab = tabs.get(id);
    if (!tab) {
      return error(res, 404, 'not_found', `tab not found: ${id}`);
    }
    await tabs.close(id);
    json(res, 200, { closed: id });
  };
}

module.exports = { handleListTabs, handleCreateTab, handleCloseTab };
