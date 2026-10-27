---
"@cloudflare/vite-plugin": patch
---

Fix Vite DevTools WebSocket connections closing unexpectedly

Leave upgrades at `/__devtools/__ws` to Vite DevTools instead of forwarding them to the Worker. This replaces socket ownership inference, which could mistake an earlier pipelined HTTP response for a WebSocket handshake. Sandbox preview requests continue to reach the Worker.
