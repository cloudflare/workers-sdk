---
"@cloudflare/quick-edit": patch
---

Use X-Forwarded-Host header for extension authority when behind a proxy

When Quick Edit is accessed through a proxy, the `X-Forwarded-Host` header is now used
to determine the authority for loading builtin extensions. This ensures extensions load
correctly when the Worker is behind a reverse proxy. The header value is only used if it
matches `*.devprod.cloudflare.dev` for security.
