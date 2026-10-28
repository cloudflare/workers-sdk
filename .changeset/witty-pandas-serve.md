---
"@cloudflare/vite-plugin": patch
---

Fix Vite DevTools WebSocket connections closing unexpectedly

Leave upgrades at `/__devtools/__ws` to Vite DevTools instead of forwarding them to the Worker. Sandbox preview requests continue to reach the Worker.
