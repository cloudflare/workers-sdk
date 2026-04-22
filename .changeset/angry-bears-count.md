---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add enabled and previews_enabled support for custom domain routes

Custom domain routes can now include optional `enabled` and `previews_enabled` boolean fields to control whether a custom domain serves production and/or preview traffic. When omitted, the API defaults apply (production enabled, previews disabled).
