---
"miniflare": patch
---

Fix `dispatchFetch()` crashing the process when a Worker answers a WebSocket upgrade with a 204, 205 or 304

When a Worker answered a WebSocket upgrade request without upgrading, Miniflare passed the response stream as the body of the response it returned. For statuses that can't have a body, constructing that response threw `Invalid response status code` outside the promise `dispatchFetch()` returns, so callers such as `vite dev` couldn't catch it and the Node.js process crashed. `dispatchFetch()` now resolves to the Worker's response, with a null body.
