---
"@cloudflare/vite-plugin": patch
---

Close Vite HMR WebSocket upgrades when Vite WebSockets are disabled

Previously, `server.ws: false` left the browser's raw upgrade socket pending because no Vite handler claimed it. Worker and Sandbox WebSocket forwarding remains unchanged.
