---
"wrangler": patch
"@cloudflare/workers-utils": patch
"@cloudflare/containers-shared": patch
"miniflare": patch
---

Redact header values outside a safe diagnostic allowlist, regardless of log sanitization settings.

Apply the same filtering to request, response, and request-options diagnostics. Strip `X-Auth-Key` alongside `Authorization` when forwarding local artifact Git requests.
