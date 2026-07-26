---
"@cloudflare/vite-plugin": patch
---

Destroy the client socket instead of crashing when a WebSocket upgrade fails

If `dispatchFetch` rejected while a WebSocket upgrade was still in flight (for example when Miniflare is disposed during a dev server shutdown or restart), the error escaped the `async` upgrade handler as an unhandled rejection. This could terminate the dev server process and leaked the client socket. The upgrade handler now catches such failures and tears the socket down cleanly.
