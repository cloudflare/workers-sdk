---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Avoid unrelated route permission checks when comparing dashboard configuration

When a Worker was last updated from the dashboard, `wrangler deploy` and `wrangler versions upload` fetched route and custom-domain metadata even when the command could not change it. Wrangler now fetches only the route categories configured for deployment, allowing Worker-scoped Editor tokens to upload Workers without routes or custom domains.
