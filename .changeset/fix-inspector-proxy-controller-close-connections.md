---
"miniflare": patch
---

Force-close connections in InspectorProxyController dispose

`InspectorProxyController.dispose()` was calling `server.close()` without first calling `server.closeAllConnections()`. Active HTTP keep-alive or WebSocket connections would prevent the close callback from firing, hanging the dispose and contributing to `wrangler dev` not exiting on Ctrl-C. The same file's `#closeServer()` method already used `closeAllConnections()` — this brings `dispose()` in line with that pattern.
