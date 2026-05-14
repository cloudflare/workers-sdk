---
"@cloudflare/vite-plugin": patch
---

Honor `X-Forwarded-Proto` when constructing the Worker's `request.url`

When running the Vite dev server behind a TLS-terminating reverse proxy or tunnel, the Worker's `request.url` was always `http://...` even though the client reached the server over `https://...`. This caused frameworks that perform Origin/Host checks (e.g. CSRF protection) to reject requests with `403`.

The Vite plugin now reads the `X-Forwarded-Proto` header from the incoming request and uses it to set the protocol of `request.url`. If the header is absent or invalid, the connection protocol is used as before. The same handling is applied to WebSocket upgrade URLs.

Fixes [#13801](https://github.com/cloudflare/workers-sdk/issues/13801).
