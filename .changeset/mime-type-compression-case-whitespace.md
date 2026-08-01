---
"miniflare": patch
---

Normalize Content-Type case and whitespace when determining compression eligibility

Responses with a `Content-Type` such as `Text/HTML` or `text/html ; charset=utf-8` are now
compressed in local development, matching how Cloudflare's network handles them. Previously
differences in letter casing or extra spacing meant these responses were left uncompressed
locally, so local behaviour diverged from production.
