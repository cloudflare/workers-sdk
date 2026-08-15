---
"@cloudflare/vite-plugin": patch
---

Stop forwarding `Accept-Encoding` on Worker WebSocket upgrades in `vite dev`

The upgrade handler copied every browser header onto the synthetic `dispatchFetch`, including `Accept-Encoding: gzip`. A Worker throw then came back as a gzipped ERROR_STACK 500, which miniflare parsed as JSON and rejected. On 1.43.0 that rejection was unhandled and killed the process; on current main it is caught and the socket is destroyed, so the Worker error is still lost.

A 101 has no body, so the content-coding header is dropped before the upgrade is forwarded. Pair with the miniflare gzip ERROR_STACK fix.
