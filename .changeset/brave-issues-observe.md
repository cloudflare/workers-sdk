---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add support for configuring real-time Issues with `observability.issues.enabled`

Wrangler now validates and uploads the Issues setting alongside the existing logs and traces observability options. The experimental configuration format supports the equivalent `observability.issues.enabled` option.
