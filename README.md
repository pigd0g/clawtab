# Clawtab

Clawtab is a lightweight HTTP bridge to Chrome DevTools Protocol. It connects to a locally running Chrome instance, attaches to page targets, and exposes a small authenticated API for browser automation, tab management, page inspection, screenshots, console capture, network capture, and script evaluation.

## Capabilities

- Connect to Chrome over CDP using its remote debugging endpoint.
- List, create, close, and target browser tabs.
- Navigate tabs and wait for page readiness.
- Inspect page accessibility structure and visible text.
- Find elements by CSS selector, XPath, or text.
- Perform browser actions such as click, fill, type, press, hover, scroll, drag, focus, clear, and select.
- Execute JavaScript in the page context.
- Capture screenshots, console logs, and network activity.

## Requirements

- Node.js
- Chrome or Chromium started with remote debugging enabled
- `CLAWTAB_TOKEN` set in the environment

Example Chrome launch:

```powershell
chrome.exe --remote-debugging-port=9222
```

## Running The Server

Install dependencies and start the service:

```powershell
npm install
$env:CLAWTAB_TOKEN = "replace-me"
node src/index.js --port 3000 --debug-port 9222
```

The server binds to `http://127.0.0.1:3000` by default. For clients and agent skills, it is convenient to also define:

```powershell
The server binds to `http://127.0.0.1:3000` by default unless you set `CLAWTAB_HOST` or pass `--host` on the CLI. To bind to your LAN (all interfaces) set `CLAWTAB_HOST=0.0.0.0` or use `--host 0.0.0.0`.

For clients and agent skills, it is convenient to define:

$env:CLAWTAB_URL = "http://<your-host-or-ip>:3000"
```

Notes:

- The process exits if `CLAWTAB_TOKEN` is missing.
- On startup, Clawtab queries `http://127.0.0.1:<debug-port>/json/version` and attaches to the discovered CDP WebSocket.
- Every HTTP request requires `Authorization: Bearer <CLAWTAB_TOKEN>`.

## Request Model

- All endpoints are on the same base URL, usually `http://127.0.0.1:3000`.
- `GET` and `DELETE` endpoints take query and path parameters only.
- `POST` endpoints accept JSON bodies.
- Errors are returned as JSON in the shape `{ "error": "code", "message": "text" }`.
- If `tabId` is omitted, Clawtab uses the first tracked tab.

## Endpoint Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Server and CDP connection status |
| `POST` | `/navigate` | Navigate a tab to a URL |
| `GET` | `/snapshot` | Get the accessibility tree flattened into element refs |
| `POST` | `/action` | Execute one browser action |
| `POST` | `/actions` | Execute multiple browser actions in sequence |
| `GET` | `/text` | Extract visible page text |
| `GET` | `/screenshot` | Capture a page screenshot |
| `GET` | `/console` | Read captured console entries |
| `GET` | `/network` | Read captured network entries |
| `POST` | `/evaluate` | Run JavaScript in page context |
| `POST` | `/wait` | Wait for load, selector, or text |
| `POST` | `/find` | Find elements by selector, XPath, or text |
| `GET` | `/tabs` | List tracked tabs |
| `POST` | `/tabs` | Create a new tab |
| `DELETE` | `/tabs/:id` | Close a tab |

## Common Headers

```http
Authorization: Bearer <CLAWTAB_TOKEN>
Content-Type: application/json
```

## Examples

The examples below use `$CLAWTAB_URL` as the API base URL and `$CLAWTAB_TOKEN` as the bearer token.

### Health

```http
GET $CLAWTAB_URL/health
Authorization: Bearer $CLAWTAB_TOKEN
```

Example response:

```json
{
  "status": "ok",
  "uptime": 5234,
npx . --debug-port 9222 --port 3000 --host 0.0.0.0
  "cdp": {
    "connected": true,
    "url": "ws://127.0.0.1:9222/devtools/browser/..."
  },
  "tabs": 3
}
```

### Tabs

List tabs:

```http
GET $CLAWTAB_URL/tabs
Authorization: Bearer $CLAWTAB_TOKEN
```

Create a tab:

```http
POST $CLAWTAB_URL/tabs
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "url": "https://example.com"
}
```

Close a tab:

```http
DELETE $CLAWTAB_URL/tabs/<tabId>
Authorization: Bearer $CLAWTAB_TOKEN
```

### Navigate

```http
POST $CLAWTAB_URL/navigate
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "optional-existing-tab-id",
  "url": "https://example.com",
  "waitFor": "load",
  "timeout": 30000
}
```

Fields:

- `newTab: true` creates a new tab instead of reusing an existing one.
- `waitFor` supports `load`, `domcontentloaded`, `networkidle`, and `none`.

### Snapshot

```http
GET $CLAWTAB_URL/snapshot?tabId=<tabId>&filter=interactive
Authorization: Bearer $CLAWTAB_TOKEN
```

Response nodes include:

- `ref`: synthetic element reference such as `e12`
- `role`: accessibility role
- `name`: accessible name
- `nodeId`: backend DOM node id for direct targeting

### Find

Find by CSS selector:

```http
POST $CLAWTAB_URL/find
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "tabId": "optional-tab-id",
  "selector": "button[type='submit']",
  "maxResults": 10
}
```

Find by XPath:

```http
POST $CLAWTAB_URL/find
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "xpath": "//a[contains(., 'Pricing')]"
}
```

Find by text:

```http
POST $CLAWTAB_URL/find
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "text": "Sign in"
}
```

### Single Action

Click by selector:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "click",
  "selector": "button[type='submit']"
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

Press a key:

```http
POST $CLAWTAB_URL/action
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "kind": "press",
  "key": "Enter"
}
```

Supported `kind` values:

- `click`
- `dblclick`
- `fill`
- `type`
- `press`
- `scroll`
- `hover`
- `drag`
- `focus`
- `clear`
- `select`

Targeting options vary by action. Most actions can target by `selector`, `nodeId`, or direct coordinates.

### Batch Actions

```http
POST $CLAWTAB_URL/actions
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "actions": [
    {
      "kind": "fill",
      "selector": "input[name='q']",
      "text": "clawtab"
    },
    {
      "kind": "press",
      "key": "Enter"
    }
  ],
  "continueOnError": false
}
```

### Wait

Wait for a selector:

```http
POST $CLAWTAB_URL/wait
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "selector": "main"
}
```

Wait for text:

```http
POST $CLAWTAB_URL/wait
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "text": "Welcome back",
  "timeout": 10000
}
```

If neither `selector` nor `text` is provided, Clawtab waits for `document.readyState === 'complete'`.

### Evaluate

```http
POST $CLAWTAB_URL/evaluate
Authorization: Bearer $CLAWTAB_TOKEN
Content-Type: application/json

{
  "expression": "document.title",
  "returnByValue": true,
  "awaitPromise": false
}
```

### Text

```http
GET $CLAWTAB_URL/text?tabId=<tabId>
Authorization: Bearer $CLAWTAB_TOKEN
```

### Screenshot

Get base64 JSON:

```http
GET $CLAWTAB_URL/screenshot?tabId=<tabId>&fullPage=true&format=png
Authorization: Bearer $CLAWTAB_TOKEN
```

Get raw image bytes:

```http
GET $CLAWTAB_URL/screenshot?format=jpeg&quality=80
Authorization: Bearer $CLAWTAB_TOKEN
Accept: image/jpeg
```

### Console

```http
GET $CLAWTAB_URL/console?tabId=<tabId>&clear=false
Authorization: Bearer $CLAWTAB_TOKEN
```

Entries contain `type`, `args`, and `timestamp`.

### Network

```http
GET $CLAWTAB_URL/network?tabId=<tabId>&clear=false
Authorization: Bearer $CLAWTAB_TOKEN
```

Entries contain `requestId`, `method`, `url`, `type`, `timestamp`, `status`, and sometimes `mimeType`.

## Typical Flow

1. Create or select a tab with `/tabs`.
2. Navigate with `/navigate`.
3. Wait for page readiness with `/wait`.
4. Inspect the page with `/snapshot`, `/find`, or `/text`.
5. Interact with `/action` or `/actions`.
6. Debug with `/console`, `/network`, and `/evaluate`.

## Security

- Clawtab is intended for local use.
- The bearer token is mandatory for every request.
- The `/evaluate` endpoint can run arbitrary JavaScript in the target page context, so only expose the service to trusted callers.