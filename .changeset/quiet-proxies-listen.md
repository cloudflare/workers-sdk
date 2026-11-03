---
"@cloudflare/vite-plugin": patch
---

Fix WebSocket connections proxied by Vite's `server.proxy` closing unexpectedly

Upgrades matching a `server.proxy` (or `preview.proxy`) entry with `ws: true`, or with a `ws:`/`wss:` target, are now left to Vite's proxy instead of also being dispatched to the Worker. Previously, when the Worker returned no WebSocket for the request, the plugin destroyed the socket that Vite's proxy was using. An upgrade whose proxy entry has a `bypass` returning a URL is still forwarded to the Worker, at that URL, since Vite does not proxy it.
