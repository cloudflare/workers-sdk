---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add production_enabled and previews_enabled support for custom domain routes

Custom domain routes can now include optional production_enabled and previews_enabled boolean fields to control whether a domain serves production and/or preview traffic. When omitted, the API defaults apply (production enabled, previews disabled).
