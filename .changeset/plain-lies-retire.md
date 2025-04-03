---
"@cloudflare/vite-plugin": patch
---

Fix inspector port change being logged on server restarts. An available inspector port is now found on the initial server start and reused across restarts.
