---
"@cloudflare/vite-plugin": patch
---

Preserve the host and non-default port (e.g. `localhost:5173`) when the Vite dev server runs over HTTPS/HTTP2, so authentication flows such as Clerk no longer redirect-loop to the wrong origin
