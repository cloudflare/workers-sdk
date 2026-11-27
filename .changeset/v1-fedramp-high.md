---
"@cloudflare/vite-plugin": patch
---

Accept `fedramp-high` in `CLOUDFLARE_COMPLIANCE_REGION`

Both `fedramp-high` and `fedramp_high` select the FedRAMP High region, including when Vite requests managed Container registry credentials. OAuth login errors now identify `CLOUDFLARE_COMPLIANCE_REGION` as the setting to remove when using OAuth instead of an API token.
