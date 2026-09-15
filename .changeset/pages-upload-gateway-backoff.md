---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Treat 502, 503, and 504 as gateway errors during asset upload retries

Pages and Workers asset uploads now retry more patiently when the Cloudflare API responds with a 502, 503 or 504 gateway error, reducing concurrency and waiting longer between attempts instead of failing the deploy quickly.
