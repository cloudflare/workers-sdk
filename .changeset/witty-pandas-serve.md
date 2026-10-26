---
"@cloudflare/vite-plugin": patch
---

fix(vite-plugin): don't destroy WebSockets owned by other upgrade listeners

Node dispatches `upgrade` to every registered listener. The dev-server handler destroyed the raw socket when the Worker returned no route, even if another listener (such as Vite DevTools at `/__devtools/__ws`) had already completed the handshake. It now leaves the socket alone once another listener has written a response.
