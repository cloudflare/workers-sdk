---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Preserve R2 bucket jurisdictions in Worker Preview deployments

`wrangler preview` previously omitted `jurisdiction` from R2 bindings configured in `previews.r2_buckets`. Forward the configured jurisdiction in deployment requests so that jurisdiction-restricted buckets can be identified correctly.
