# Clawtab

Clawtab is a lightweight HTTP bridge to the Chrome DevTools Protocol. It can start Chrome/Chromium for you, connect over CDP, and expose a small authenticated HTTP API for browser automation, tab management, screenshots, console capture, network capture, and script evaluation.

## Features

- Starts Chrome/Chromium automatically for `npx clawtab` or `clawtab`
- Reuses an existing browser if remote debugging is already available
- Resolves auth tokens from environment or `~/.clawtab/config.json`
- Generates and persists a token automatically on first run
- Exposes an authenticated local HTTP API for browser automation
- Supports tab listing, creation, navigation, actions, screenshots, evaluate, console, and network capture

## Install

### Run with npx

```bash
npx clawtab --port 3000 --debug-port 9222
```

### Install globally

```bash
npm install -g clawtab
clawtab --port 3000 --debug-port 9222
```

### Run from source

```bash
npm install
npm start
```

If you want the raw server entrypoint without browser launch logic:

```bash
npm run start:server -- --debug-port 9222
```

## Token configuration

Clawtab resolves its bearer token in this order:

1. `CLAWTAB_TOKEN` environment variable
2. `~/.clawtab/config.json`
3. Generate a new token, save it to `~/.clawtab/config.json`, and print it to the console

### Environment variable example

```bash
export CLAWTAB_TOKEN="replace-me"
clawtab
```

PowerShell:

```powershell
$env:CLAWTAB_TOKEN = "replace-me"
clawtab
```

### Config file example

`~/.clawtab/config.json`

```json
{
  "token": "generated-token-here"
}
```

Config path by platform:

- Linux: `/home/<user>/.clawtab/config.json`
- macOS: `/Users/<user>/.clawtab/config.json`
- Windows: `C:\Users\<user>\.clawtab\config.json`

Clawtab uses Node.js `os.homedir()` to resolve the home directory, so the same code path works across Linux, macOS, and Windows.

## Usage

```bash
clawtab [--port <port>] [--debug-port <port>] [--host <host>]
```

Options:

- `--port <port>`: HTTP server port. Default `3000`
- `--debug-port <port>`: Chrome DevTools remote debugging port. Default `9222`
- `--host <host>`: HTTP bind host. Default `0.0.0.0`
- `--help`: Show CLI help

Examples:

```bash
# Start with automatic token loading/generation
npx clawtab

# Bind to all interfaces on a custom port
clawtab --host 0.0.0.0 --port 3010

# Use a specific token from the environment
CLAWTAB_TOKEN=mysecret clawtab --debug-port 9333
```

## How startup works

- The CLI resolves the auth token.
- If Chrome/Chromium is already listening on the requested debug port, Clawtab reuses it.
- Otherwise Clawtab launches Chrome/Chromium with remote debugging enabled.
- Clawtab discovers the DevTools WebSocket via `http://127.0.0.1:<debug-port>/json/version`.
- The HTTP API starts and requires `Authorization: Bearer <token>` on every request.

## API base URL

By default the server listens on:

```text
http://127.0.0.1:3000
```

If you bind another host or port, update your client accordingly.

Common headers:

```http
Authorization: Bearer <CLAWTAB_TOKEN>
Content-Type: application/json
```

## Endpoint summary

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

## Quick examples

Health check:

```bash
curl -H "Authorization: Bearer $CLAWTAB_TOKEN" \
  http://127.0.0.1:3000/health
```

Open a page in a new tab:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLAWTAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  http://127.0.0.1:3000/tabs
```

Navigate the current tab:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLAWTAB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","waitFor":"load"}' \
  http://127.0.0.1:3000/navigate
```

Capture text:

```bash
curl -H "Authorization: Bearer $CLAWTAB_TOKEN" \
  http://127.0.0.1:3000/text
```

## Cross-platform notes

- Token persistence uses `os.homedir()`, so the config location is portable.
- The CLI relies on the `chrome-launcher` package to find and start Chrome/Chromium on Linux, macOS, and Windows.
- If Chrome is not installed in a standard location, install Chrome/Chromium first or use the raw server mode against an already running browser with remote debugging enabled.

## Development

```bash
git clone https://github.com/pigd0g/clawtab
cd clawtab
npm install
npm start
```
