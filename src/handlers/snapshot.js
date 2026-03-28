'use strict';

const { json, error } = require('../utils/response');

/**
 * GET /snapshot — accessibility tree extraction.
 *
 * Query: tabId?, filter=all|interactive, compact=true|false
 */
function handleSnapshot(cdp, tabs) {
  return async ({ res, query }) => {
    const tab = tabs.resolveSession(query.tabId);
    const filter = query.filter || 'all';

    // Get the full accessibility tree
    const result = await cdp.send('Accessibility.getFullAXTree', {}, tab.sessionId);
    const nodes = result.nodes || [];

    // Build flattened node list with refs
    const output = [];
    let refIdx = 0;

    for (const node of nodes) {
      const role = _prop(node, 'role');
      const name = _prop(node, 'name');

      // Skip ignored nodes
      if (node.ignored) continue;
      if (role === 'none' || role === 'generic') {
        // Include generics only if they have a name
        if (!name) continue;
      }

      // Interactive filter: only actionable elements
      if (filter === 'interactive') {
        const interactiveRoles = new Set([
          'button', 'link', 'textbox', 'checkbox', 'radio',
          'combobox', 'listbox', 'menuitem', 'tab', 'switch',
          'slider', 'spinbutton', 'searchbox', 'option',
          'menuitemcheckbox', 'menuitemradio', 'treeitem',
        ]);
        if (!interactiveRoles.has(role)) continue;
      }

      const entry = {
        ref: `e${refIdx++}`,
        role: role || '',
        name: name || '',
        nodeId: node.backendDOMNodeId,
      };

      // Add value for inputs
      const value = _prop(node, 'value');
      if (value !== undefined && value !== '') entry.value = value;

      // Add checked state
      const checked = _prop(node, 'checked');
      if (checked !== undefined) entry.checked = checked;

      // Add disabled state
      const disabled = _prop(node, 'disabled');
      if (disabled) entry.disabled = true;

      // Add description if present
      const desc = _prop(node, 'description');
      if (desc) entry.description = desc;

      output.push(entry);
    }

    json(res, 200, { tabId: tab.targetId, nodes: output });
  };
}

/** Extract a named property from an AX node. */
function _prop(node, name) {
  if (!node.properties) return undefined;
  const prop = node.properties.find((p) => p.name === name);
  if (!prop) {
    // Some properties are top-level on the node
    if (node[name]?.value !== undefined) return node[name].value;
    if (node[name] !== undefined && typeof node[name] !== 'object') return node[name];
    return undefined;
  }
  return prop.value?.value !== undefined ? prop.value.value : prop.value;
}

module.exports = handleSnapshot;
