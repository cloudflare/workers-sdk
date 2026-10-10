---
"@cloudflare/vite-plugin": patch
---

Fix dev server destroying WebSockets owned by other `upgrade` listeners (e.g. Vite DevTools at `/__devtools/__ws`).

Node dispatches `upgrade` to every registered listener. The plugin awaited `dispatchFetch` and called `socket.destroy()` when the Worker had no route, killing sockets another listener had already upgraded (client saw `onopen` then close `1006`). The handler now returns without destroying when the Worker yields no `WebSocket`, and only tears down on `dispatchFetch` failure or before a second upgrade if no other listener has claimed the socket.
