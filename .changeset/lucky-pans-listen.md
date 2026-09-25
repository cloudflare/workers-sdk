---
"@cloudflare/vite-plugin": patch
---

Stop destroying WebSocket upgrades owned by other `upgrade` listeners

Node invokes every `upgrade` listener registered on Vite's HTTP server, so the Cloudflare listener shares each upgrade with Vite's HMR listener and third-party listeners such as Vite DevTools (`/__devtools/__ws`). Previously the socket was destroyed whenever the Worker returned no `webSocket`, which could tear down a connection another listener had already upgraded while `dispatchFetch()` was pending (the client saw an immediate close with code 1006).

The handler now only answers or tears down upgrades that no other listener could own, and sockets it preserves for another listener are cleaned up on server close so shutdown does not hang.
