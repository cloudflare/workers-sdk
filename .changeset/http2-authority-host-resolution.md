---
"@cloudflare/vite-plugin": patch
---

Preserve the request authority under HTTP/2 so `request.url` keeps its port

Browsers negotiate HTTP/2 whenever `server.https` is enabled, and HTTP/2 carries the authority in the `:authority` pseudo-header rather than in `Host`. Pseudo-headers are skipped when the Fetch `Headers` are built, so `Host` was absent and request construction fell back to a bare `"localhost"`, dropping the host and port. A Worker running behind `vite dev --https` on port 5173 therefore saw `https://localhost/` instead of `https://localhost:5173/`, and `X-Forwarded-Host` was never set at all.

The authority is now read from `Host` first and from `:authority` second, and `X-Forwarded-Host` falls back to the host of the resolved request URL when no `Host` header is present. Auth libraries that rebuild redirect URLs from `request.url` or the forwarded headers — such as Clerk's handshake flow, which previously redirected to the wrong origin and looped — keep the correct port over HTTPS.
