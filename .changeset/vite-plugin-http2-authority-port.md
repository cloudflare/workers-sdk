---
"@cloudflare/vite-plugin": patch
---

Preserve the port when the dev server is accessed over HTTPS

A Worker served through `vite dev` over HTTPS could see `https://localhost`
where the browser had asked for `https://localhost:5173`. The port was dropped
from both `request.url` and the `X-Forwarded-Host` header, so auth libraries
that rebuild redirect URLs from the incoming request — Clerk's handshake, for
example — sent users to that portless origin and could loop. Serving over plain
HTTP was unaffected.

The port is now preserved in both, so those redirects come back to the dev
server.
