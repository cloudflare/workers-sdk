---
"@cloudflare/vite-plugin": patch
---

Preserve the port when a request arrives over HTTP/2

Serving the dev server over HTTPS meant `request.url` and `X-Forwarded-Host` could lose the port, so a Worker saw `https://localhost` where the browser had asked for `https://localhost:5173`. Auth libraries that rebuild redirect URLs from the request — Clerk's handshake, for example — then redirected to the wrong origin and could loop. Plain HTTP was unaffected.

Browsers usually negotiate HTTP/2 over HTTPS, and HTTP/2 carries the authority in the `:authority` pseudo-header rather than in `Host`. Pseudo-headers are dropped when the incoming request is converted to a Fetch `Request`, so no `Host` was found and the host fell back to a bare `localhost`. `X-Forwarded-Host` was skipped entirely for the same reason.

The authority is now read from `:authority` when `Host` is absent, and `X-Forwarded-Host` falls back to the resolved request URL. HTTP/1.1 requests are unchanged, since `Host` is still preferred whenever it is present.
