---
"@cloudflare/config": patch
"@cloudflare/workers-utils": patch
---

Clarify the `images.url_transformations.allowed_origins` documentation

When `allowed_origins` is set, only the listed origins are allowed. The Worker's own zone isn't included unless it's listed.
