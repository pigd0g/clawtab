'use strict';

const { json, error } = require('../utils/response');

/**
 * POST /action — execute a single browser action.
 *
 * Body: { tabId?, kind, ref?, selector?, nodeId?, x?, y?, text?, key?, value?, direction?, amount? }
 *
 * Kinds: click, dblclick, fill, type, press, scroll, hover, drag, focus, clear, select
 */
function handleAction(cdp, tabs) {
  return async ({ res, body }) => {
    if (!body || !body.kind) {
      return error(res, 400, 'bad_request', 'kind is required');
    }
    const result = await executeAction(cdp, tabs, body);
    json(res, 200, result);
  };
}

/**
 * Execute a single action. Shared by /action and /actions.
 */
async function executeAction(cdp, tabs, action) {
  const tab = tabs.resolveSession(action.tabId);
  const sid = tab.sessionId;
  const kind = action.kind;

  // Resolve target node ID
  let nodeId = action.nodeId;
  if (!nodeId && action.selector) {
    nodeId = await _resolveSelector(cdp, sid, action.selector);
  }

  switch (kind) {
    case 'click':
    case 'dblclick': {
      const { x, y } = nodeId
        ? await _getElementCenter(cdp, sid, nodeId)
        : { x: action.x || 0, y: action.y || 0 };

      const clickCount = kind === 'dblclick' ? 2 : 1;
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', button: 'left', x, y, clickCount,
      }, sid);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', button: 'left', x, y, clickCount,
      }, sid);
      return { success: true, kind, x, y };
    }

    case 'fill': {
      if (action.text === undefined && action.value === undefined) {
        throw new Error('text or value is required for fill');
      }
      const text = action.text ?? action.value;

      // Focus the element first
      if (nodeId) {
        await cdp.send('DOM.focus', { backendNodeId: nodeId }, sid);
      }

      // Select all existing text then replace
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, // Ctrl
      }, sid);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2,
      }, sid);

      // Type the text using insertText
      await cdp.send('Input.insertText', { text }, sid);
      return { success: true, kind, text };
    }

    case 'type': {
      if (!action.text) throw new Error('text is required for type');
      if (nodeId) {
        await cdp.send('DOM.focus', { backendNodeId: nodeId }, sid);
      }
      // Type character by character with key events
      for (const ch of action.text) {
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown', text: ch, key: ch, unmodifiedText: ch,
        }, sid);
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key: ch,
        }, sid);
      }
      return { success: true, kind, text: action.text };
    }

    case 'press': {
      if (!action.key) throw new Error('key is required for press');
      const keyDef = _resolveKey(action.key);
      const modifiers = _modifiers(action.modifiers);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', ...keyDef, modifiers,
      }, sid);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', ...keyDef, modifiers,
      }, sid);
      return { success: true, kind, key: action.key };
    }

    case 'scroll': {
      const { x, y } = nodeId
        ? await _getElementCenter(cdp, sid, nodeId)
        : { x: action.x || 0, y: action.y || 0 };

      const deltaX = action.deltaX || 0;
      const deltaY = action.deltaY || (action.direction === 'up' ? -300 : 300);

      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x, y, deltaX, deltaY,
      }, sid);
      return { success: true, kind, deltaX, deltaY };
    }

    case 'hover': {
      const { x, y } = nodeId
        ? await _getElementCenter(cdp, sid, nodeId)
        : { x: action.x || 0, y: action.y || 0 };

      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y,
      }, sid);
      return { success: true, kind, x, y };
    }

    case 'drag': {
      if (!action.toX && !action.toY && !action.toSelector) {
        throw new Error('drag requires toX/toY or toSelector');
      }
      const from = nodeId
        ? await _getElementCenter(cdp, sid, nodeId)
        : { x: action.x || 0, y: action.y || 0 };

      let to;
      if (action.toSelector) {
        const toNodeId = await _resolveSelector(cdp, sid, action.toSelector);
        to = await _getElementCenter(cdp, sid, toNodeId);
      } else {
        to = { x: action.toX, y: action.toY };
      }

      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', button: 'left', x: from.x, y: from.y, clickCount: 1,
      }, sid);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: to.x, y: to.y,
      }, sid);
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', button: 'left', x: to.x, y: to.y,
      }, sid);
      return { success: true, kind, from, to };
    }

    case 'focus': {
      if (!nodeId) throw new Error('selector or nodeId required for focus');
      await cdp.send('DOM.focus', { backendNodeId: nodeId }, sid);
      return { success: true, kind };
    }

    case 'clear': {
      if (nodeId) await cdp.send('DOM.focus', { backendNodeId: nodeId }, sid);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2,
      }, sid);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2,
      }, sid);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46,
      }, sid);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46,
      }, sid);
      return { success: true, kind };
    }

    case 'select': {
      if (!action.value && !action.values) throw new Error('value is required for select');
      if (!nodeId) throw new Error('selector or nodeId required for select');
      const values = action.values || [action.value];
      const result = await cdp.send('Runtime.callFunctionOn', {
        functionDeclaration: `function(values) {
          const opts = Array.from(this.options);
          opts.forEach(o => o.selected = values.includes(o.value));
          this.dispatchEvent(new Event('change', { bubbles: true }));
          return opts.filter(o => o.selected).map(o => o.value);
        }`,
        arguments: [{ value: values }],
        objectId: (await _getRemoteObject(cdp, sid, nodeId)).objectId,
        returnByValue: true,
      }, sid);
      return { success: true, kind, selected: result.result.value };
    }

    default:
      throw new Error(`unknown action kind: ${kind}`);
  }
}

/** Resolve a CSS selector to a backend node ID. */
async function _resolveSelector(cdp, sessionId, selector) {
  const { root } = await cdp.send('DOM.getDocument', {}, sessionId);
  const { nodeId } = await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector,
  }, sessionId);

  if (!nodeId) throw new Error(`element not found: ${selector}`);

  // Get backend node ID
  const desc = await cdp.send('DOM.describeNode', { nodeId }, sessionId);
  return desc.node.backendNodeId;
}

/** Get center coordinates of an element by backend node ID. */
async function _getElementCenter(cdp, sessionId, backendNodeId) {
  try {
    await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId }, sessionId);
  } catch { /* may not be scrollable */ }

  const { model } = await cdp.send('DOM.getBoxModel', { backendNodeId }, sessionId);
  const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content;
  return {
    x: (x1 + x3) / 2,
    y: (y1 + y3) / 2,
  };
}

/** Get a remote object reference for a backend node. */
async function _getRemoteObject(cdp, sessionId, backendNodeId) {
  const { object } = await cdp.send('DOM.resolveNode', { backendNodeId }, sessionId);
  return object;
}

/** Map key names to CDP key event properties. */
function _resolveKey(key) {
  const map = {
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
    Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
    Delete: { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
    Home: { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 },
    End: { key: 'End', code: 'End', windowsVirtualKeyCode: 35 },
    PageUp: { key: 'PageUp', code: 'PageUp', windowsVirtualKeyCode: 33 },
    PageDown: { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34 },
    Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
  };

  if (map[key]) return map[key];

  // Single character
  if (key.length === 1) {
    return {
      key,
      text: key,
      code: `Key${key.toUpperCase()}`,
      windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    };
  }

  // F-keys
  const fMatch = key.match(/^F(\d+)$/);
  if (fMatch) {
    const n = parseInt(fMatch[1]);
    return { key, code: key, windowsVirtualKeyCode: 111 + n };
  }

  return { key, code: key };
}

/** Convert modifier names to CDP modifier bitmask. */
function _modifiers(mods) {
  if (!mods) return 0;
  let mask = 0;
  if (mods.alt) mask |= 1;
  if (mods.ctrl || mods.control) mask |= 2;
  if (mods.meta || mods.command) mask |= 4;
  if (mods.shift) mask |= 8;
  return mask;
}

module.exports = handleAction;
module.exports.executeAction = executeAction;
