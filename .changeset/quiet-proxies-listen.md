---
"@cloudflare/vite-plugin": patch
---

Fix WebSocket connections proxied by Vite's `server.proxy` closing unexpectedly

WebSocket connections to a path covered by a `server.proxy` (or `preview.proxy`) entry with `ws: true`, or with a `ws:`/`wss:` target, now stay open instead of being closed right after they connect when your Worker has no WebSocket route for that path. If the entry has a `bypass` that returns a path, your Worker handles the connection at that path.
