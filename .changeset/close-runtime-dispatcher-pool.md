---
"miniflare": patch
---

fix: close all open handles on dispose to prevent process hangs

Several resources were not being properly cleaned up during `Miniflare.dispose()`, which could leave the Node.js event loop alive and cause processes (particularly tests using `node --test`) to hang instead of exiting cleanly:

- The internal undici `Pool` used to dispatch fetch requests to the workerd runtime was not closed. Lingering TCP sockets from this pool could keep the event loop alive indefinitely.
- `WebSocketServer` instances for live reload and WebSocket proxying were never closed, leaving connected clients' sockets open.
- The `InspectorProxy` was not closing its runtime WebSocket connection, relying on process death to break the connection.
- `HyperdriveProxyController.dispose()` had a missing `return` in a `.map()` callback, causing `Promise.allSettled` to resolve immediately without waiting for `net.Server` instances to close.
- `ProxyClientBridge` was not clearing its finalization batch `setTimeout` during disposal.
- `InspectorProxyController.dispose()` was not calling `server.closeAllConnections()` before `server.close()`, so active HTTP keep-alive or WebSocket connections could prevent the close callback from firing.
