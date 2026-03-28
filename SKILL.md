---
name: clawtab
description: "Use Clawtab to control a local Chrome tab over HTTP. Use when the request involves browser automation, opening or closing tabs, navigating pages, clicking or filling elements, waiting for UI state, taking screenshots, reading page text, running JavaScript in the page, or inspecting console or network activity. Assumes CLAWTAB_URL and CLAWTAB_TOKEN are already set in the environment."
---

# Clawtab

Use this skill when you need to drive a Chrome or Chromium tab through the local Clawtab service.

Assumptions:

- `CLAWTAB_URL` is the base URL of the running Clawtab server, for example `http://127.0.0.1:3000`.
- `CLAWTAB_TOKEN` is the bearer token expected by the server.
- Every request must send `Authorization: Bearer $CLAWTAB_TOKEN`.

## Operating Guidance

- Start with `GET /tabs` or `GET /health` if you need to confirm the service is live.
- If the request is exploratory, use `POST /navigate`, then `POST /wait`, then inspect with `GET /snapshot` or `POST /find` before acting.
- Prefer `selector` targeting when the DOM is stable. Use `nodeId` when you already have it from `/snapshot`.
- Use `POST /actions` for multi-step interactions so the workflow is explicit.
- Use `GET /console` and `GET /network` when automation behaves unexpectedly.
- Use `POST /evaluate` sparingly when existing endpoints are not enough.
- If a `tabId` is omitted, Clawtab uses the first tracked tab. That is convenient, but explicit `tabId` is safer in multi-tab flows.

## Request Template

```http
METHOD $CLAWTAB_URL/<path>
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json
```

Error responses are JSON:

```json
{
  "error": "bad_request",
  "message": "details"
}
```

## Endpoint Examples

### `GET /health`

Use for service readiness and CDP attachment status.

```http
GET $CLAWTAB_URL/health
Authorization: Bearer $CLAWTAB_TOKEN
```

### `GET /tabs`

List currently tracked tabs.

```http
GET $CLAWTAB_URL/tabs
Authorization: Bearer $CLAWTAB_TOKEN
```

Typical response:

```json
{
  "tabs": [
    {
      "targetId": "A1B2C3",
      "sessionId": "D4E5F6",
      "url": "https://example.com",
      "title": "Example Domain"
    }
  ]
}
```

### `POST /tabs`

Create a new tab. Defaults to `about:blank` if no URL is provided.

```http
POST $CLAWTAB_URL/tabs
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "url": "https://example.com"
}
```

### `DELETE /tabs/:id`

Close a tab by `targetId`.

```http
DELETE $CLAWTAB_URL/tabs/A1B2C3
Authorization: Bearer $CLAWTAB_TOKEN
```

### `POST /navigate`

Navigate an existing tab or open a new one.

Existing tab:

```http
POST $CLAWTAB_URL/navigate
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "A1B2C3",
  "url": "https://news.ycombinator.com",
  "waitFor": "load",
  "timeout": 30000
}
```

Open a new tab while navigating:

```http
POST $CLAWTAB_URL/navigate
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "url": "https://example.com",
  "newTab": true,
  "waitFor": "domcontentloaded"
}
```

`waitFor` supports `load`, `domcontentloaded`, `networkidle`, and `none`.

### `GET /snapshot`

Get the page accessibility tree as a flattened list of elements. This is the best inspection endpoint when you need actionable controls.

```http
GET $CLAWTAB_URL/snapshot?tabId=A1B2C3&filter=interactive
Authorization: Bearer $CLAWTAB_TOKEN
```

Typical node shape:

```json
{
  "ref": "e7",
  "role": "button",
  "name": "Sign in",
  "nodeId": 987,
  "description": "Primary call to action"
}
```

Query options:

- `tabId`: target tab id
- `filter=interactive`: only actionable controls
- `filter=all`: full filtered accessibility output

### `POST /find`

Find matching elements by CSS selector, XPath, or text content.

By selector:

```http
POST $CLAWTAB_URL/find
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "A1B2C3",
  "selector": "input[name='email']",
  "maxResults": 5
}
```

By XPath:

```http
POST $CLAWTAB_URL/find
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "xpath": "//button[contains(., 'Continue')]"
}
```

By text:

```http
POST $CLAWTAB_URL/find
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "text": "Continue"
}
```

### `POST /action`

Run one browser interaction. Supported kinds are `click`, `dblclick`, `fill`, `type`, `press`, `scroll`, `hover`, `drag`, `focus`, `clear`, and `select`.

Click a button by selector:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "A1B2C3",
  "kind": "click",
  "selector": "button[type='submit']"
}
```

Double click at coordinates:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "dblclick",
  "x": 420,
  "y": 280
}
```

Fill an input:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "fill",
  "selector": "input[name='email']",
  "text": "user@example.com"
}
```

Type text without clearing first:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "type",
  "selector": "textarea",
  "text": "hello world"
}
```

Press a key with modifiers:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "press",
  "key": "A",
  "modifiers": {
    "ctrl": true
  }
}
```

Scroll down near an element:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "scroll",
  "selector": "main",
  "deltaY": 500
}
```

Hover an element:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "hover",
  "selector": ".menu-trigger"
}
```

Drag an element to another selector:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "drag",
  "selector": ".card",
  "toSelector": ".drop-zone"
}
```

Focus an input by node id:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "focus",
  "nodeId": 987
}
```

Clear a focused or targeted field:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "clear",
  "selector": "input[name='search']"
}
```

Select a value in a `<select>` element:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "select",
  "selector": "select[name='country']",
  "value": "AU"
}
```

### `POST /actions`

Run multiple actions in order.

```http
POST $CLAWTAB_URL/actions
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "A1B2C3",
  "actions": [
    {
      "kind": "fill",
      "selector": "input[name='username']",
      "text": "alice"
    },
    {
      "kind": "fill",
      "selector": "input[name='password']",
      "text": "secret"
    },
    {
      "kind": "click",
      "selector": "button[type='submit']"
    }
  ],
  "continueOnError": false
}
```

### `POST /wait`

Wait for load, a selector, or text.

Wait for a selector:

```http
POST $CLAWTAB_URL/wait
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "A1B2C3",
  "selector": "#dashboard",
  "timeout": 15000
}
```

Wait for text:

```http
POST $CLAWTAB_URL/wait
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "text": "Welcome back",
  "timeout": 15000
}
```

Wait for page load only:

```http
POST $CLAWTAB_URL/wait
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{}
```

### `POST /evaluate`

Run JavaScript in page context.

Return the page title:

```http
POST $CLAWTAB_URL/evaluate
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "A1B2C3",
  "expression": "document.title",
  "returnByValue": true
}
```

Await a promise:

```http
POST $CLAWTAB_URL/evaluate
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "expression": "fetch('/api/me').then(r => r.json())",
  "awaitPromise": true,
  "returnByValue": true
}
```

### `GET /text`

Get visible text from the page body.

```http
GET $CLAWTAB_URL/text?tabId=A1B2C3
Authorization: Bearer $CLAWTAB_TOKEN
```

### `GET /screenshot`

Return screenshot data as JSON or raw image bytes.

JSON base64 response:

```http
GET $CLAWTAB_URL/screenshot?tabId=A1B2C3&fullPage=true&format=png
Authorization: Bearer $CLAWTAB_TOKEN
```

Raw JPEG bytes:

```http
GET $CLAWTAB_URL/screenshot?tabId=A1B2C3&format=jpeg&quality=80
Authorization: Bearer $CLAWTAB_TOKEN
Accept: image/jpeg
```

Supported formats are `png`, `jpeg`, and `webp`.

### `GET /console`

Read captured console entries. Use `clear=true` to flush them after reading.

```http
GET $CLAWTAB_URL/console?tabId=A1B2C3&clear=false
Authorization: Bearer $CLAWTAB_TOKEN
```

Entry shape:

```json
{
  "type": "log",
  "args": ["loaded", 123],
  "timestamp": 1743123456789
}
```

### `GET /network`

Read captured network requests. Use `clear=true` to flush them after reading.

```http
GET $CLAWTAB_URL/network?tabId=A1B2C3&clear=false
Authorization: Bearer $CLAWTAB_TOKEN
```

Entry shape:

```json
{
  "requestId": "12345.67",
  "method": "GET",
  "url": "https://example.com/api/data",
  "type": "Fetch",
  "timestamp": 1743123456.789,
  "status": 200,
  "mimeType": "application/json"
}
```

## Recommended Workflows

### Open a page and inspect it

1. `POST /tabs` or `POST /navigate`
2. `POST /wait`
3. `GET /snapshot` with `filter=interactive`
4. `POST /find` if you need selector-driven verification

### Submit a form

1. `POST /navigate`
2. `POST /wait`
3. `POST /actions` with `fill`, `fill`, `click`
4. `POST /wait` for success text or selector

### Debug client-side failures

1. `GET /console`
2. `GET /network`
3. `POST /evaluate` for targeted inspection

## Constraints

- Clawtab is local-first and assumes a trusted caller.
- `POST /evaluate` executes arbitrary JavaScript in the active page context.
- The API does not expose DOM mutation helpers beyond the action and evaluate endpoints.
