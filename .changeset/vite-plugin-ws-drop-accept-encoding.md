---
"@cloudflare/vite-plugin": patch
---

Stop forwarding `Accept-Encoding` on Worker WebSocket upgrades in `vite dev`

Previously, when a Worker threw an error while handling a WebSocket upgrade during `vite dev`, the underlying error was lost (and on older versions the dev server could exit). Worker errors on WebSocket upgrades are now surfaced correctly.
