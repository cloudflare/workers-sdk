---
"miniflare": patch
---

Fix Hyperdrive proxy servers not closing on dispose

The `dispose()` method in `HyperdriveProxyController` was missing a `return` statement, so the Promises from `server.close()` were never passed to `Promise.allSettled()`. This meant the proxy `net.Server` instances were never actually waited on to close, potentially keeping the Node.js event loop alive.
