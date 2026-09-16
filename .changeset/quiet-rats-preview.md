---
"@cloudflare/autoconfig": patch
---

Stop adding a `preview` script when configuring projects for `cf`

Projects can continue using their existing development and preview scripts, or invoke `cf dev` directly. Wrangler-targeted autoconfiguration continues to add its existing `preview` script.
