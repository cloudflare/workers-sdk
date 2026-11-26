---
"miniflare": patch
---

Fix an uncaught `ECONNRESET` when Miniflare shuts down or restarts after reading a rejected WebSocket upgrade response

Reading the body of a non-101 response to a WebSocket upgrade left Miniflare's connection to the local runtime open with no `error` listener, so a reset from the runtime, for example on `dispose()` or a dev server restart, threw. The connection is now closed once the body has been read.
