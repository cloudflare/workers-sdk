---
"miniflare": minor
---

Add missing devtools endpoints to browser rendering local binding.

The local browser rendering binding now implements the full set of devtools endpoints, matching the remote Browser Rendering API:

- `GET /v1/limits` — returns local concurrency defaults
- `GET /v1/history` — returns empty array (no persistence in local dev)
- `GET /v1/devtools/session` - list and inspect active sessions
- `GET /v1/devtools/session/:id` — list and inspect active session
- `GET /v1/devtools/browser/:id/json/version` — Browser version metadata, includes webSocketDebuggerUrl
- `GET /v1/devtools/browser/:id/json/list` — A list of all available websocket targets
- `GET /v1/devtools/browser/:id/json` — Alias for `GET /v1/devtools/browser/:id/json`
- `GET /v1/devtools/browser/:id/json/protocol` — The current devtools protocol, as JSON. Includes webSocketDebuggerUrl and devtoolsFrontendUrl
- `PUT /v1/devtools/browser/:id/json/new` — Opens a new tab. Responds with the websocket target data for the new tab
- `GET /v1/devtools/browser/:id/json/activate/:target` — Brings a page into the foreground (activate a tab)
- `GET /v1/devtools/browser/:id/json/close/:target` — Closes the target page identified by targetId
- `GET /v1/devtools/browser/:id/page/:target` — WebSocket connection to a page target
- `GET /v1/devtools/browser/:id` — WebSocket connection to a previously acquired browser session
- `DELETE /v1/devtools/browser/:id` — Closes a browser session
- `POST /v1/devtools/browser` — Acquires a new session
- `GET /v1/devtools/browser` — Acquire a new session and connect via WebSocket in one step, returning `cf-browser-session-id` header
