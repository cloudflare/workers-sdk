---
"@cloudflare/vite-plugin": patch
---

Route WebSocket service-binding upgrades to the entry worker in Vite dev

Previously, requests forwarded to the Vite proxy worker always went through the Vite middleware fetcher. That broke service-binding WebSocket upgrades targeting the entry worker in dev mode, because upgrade requests were sent down an HTTP-only middleware path and crashed before the user worker could handle them.
