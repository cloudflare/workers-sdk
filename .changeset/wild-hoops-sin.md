---
"miniflare": patch
---

Fix WebSocket proxy timeout by disabling requestTimeout

The dev registry proxy server was experiencing connection timeouts around
90 seconds for long-lived WebSocket connections. This was caused by Node.js's
default requestTimeout (300s in the spec, but observed at ~90s empirically).

When proxying WebSocket connections, the HTTP server's request timeout was
still active on the underlying socket, causing ERR_HTTP_REQUEST_TIMEOUT errors
to be thrown and both client and server sockets to be destroyed.

Setting requestTimeout: 0 in createServer options disables this timeout,
allowing WebSocket connections to remain open indefinitely as needed.
