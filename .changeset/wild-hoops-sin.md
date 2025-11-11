---
"miniflare": patch
---

Fix WebSocket proxy timeout by disabling Node.js HTTP timeouts

The dev registry proxy server was experiencing connection timeouts around
60-90 seconds for long-lived WebSocket connections. This was caused by Node.js's
headersTimeout (defaults to min(60s, requestTimeout)) which is checked periodically
by connectionsCheckingInterval (defaults to 30s).

When proxying WebSocket connections, the HTTP server's headers timeout was
still active on the underlying socket, causing ERR_HTTP_REQUEST_TIMEOUT errors
to be thrown and both client and server sockets to be destroyed.

Setting both headersTimeout: 0 and requestTimeout: 0 in createServer options
disables timeout enforcement, allowing WebSocket connections to remain open
indefinitely as needed.
