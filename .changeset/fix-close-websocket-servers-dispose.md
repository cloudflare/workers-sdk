---
"miniflare": patch
---

Close WebSocket servers during dispose to prevent lingering connections

The `#liveReloadServer` and `#webSocketServer` (both created with `noServer: true`) were never explicitly closed during `Miniflare.dispose()`. Connected WebSocket clients (e.g., browser live reload, devtools) would keep sockets alive, preventing the Node.js event loop from draining cleanly.
