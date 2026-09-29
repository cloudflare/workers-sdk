---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Allow `"us"` as a jurisdiction for Container applications

Container placement constraints now accept `constraints.jurisdiction: "us"` in Wrangler and typed Cloudflare configuration. This makes the US jurisdiction available alongside `"eu"` and `"fedramp"`.
