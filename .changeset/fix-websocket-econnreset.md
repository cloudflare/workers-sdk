---
"@cloudflare/vite-plugin": patch
---

Fix dev server crash on WebSocket client disconnect

When a WebSocket client disconnects while an upgrade request is being processed, the server would crash with an unhandled `ECONNRESET` error. The fix adds an error handler to the socket at the start of the upgrade process.
