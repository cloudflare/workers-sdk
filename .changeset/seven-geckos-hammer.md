---
"@cloudflare/vite-plugin": patch
---

Fix worker-to-worker WebSocket service bindings in Vite dev

Previously, worker-to-worker service bindings in `@cloudflare/vite-plugin` dev mode routed WebSocket upgrade requests through the Vite middleware fetcher. That broke upgrades handled by another worker, because the request missed the user worker service binding and failed before the WebSocket handshake could complete.
