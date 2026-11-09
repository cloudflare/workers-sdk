---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/workers-auth": minor
"@cloudflare/containers-shared": minor
---

Add custom Cloudflare API headers through `CLOUDFLARE_API_HEADERS`

Set `CLOUDFLARE_API_HEADERS` to a JSON object such as `{"X-Custom-Header":"value"}` to add headers to Cloudflare API requests. Custom headers override existing unprotected request headers, body and transport headers are protected, and custom values are redacted from request diagnostics by default. Set `WRANGLER_LOG_SANITIZE=false` to include custom values in debug diagnostics.
