---
"@cloudflare/vite-plugin": patch
---

Forward response headers from the Worker on WebSocket upgrade responses

Headers set on a `new Response(null, { status: 101, webSocket, headers })` returned from the Worker are now propagated to the upgrade response sent to the browser during `vite dev`. Previously the headers were dropped, so cookies (`Set-Cookie`) and custom headers (`X-*`) on WebSocket handshake responses were invisible client-side — even though they were delivered correctly by `wrangler dev`.
