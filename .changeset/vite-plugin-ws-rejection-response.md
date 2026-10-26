---
"@cloudflare/vite-plugin": patch
---

Fix WebSocket upgrade handling in dev mode so non-101 HTTP responses (e.g. 401 Unauthorized or 403 Forbidden) from Workers are delivered to the client instead of abruptly destroying the socket.
