---
"wrangler": patch
"@cloudflare/workers-utils": patch
"@cloudflare/containers-shared": patch
"miniflare": patch
---

Like `Authorization`, omit the `X-Auth-Key` header from debug diagnostics regardless of log sanitization settings.
