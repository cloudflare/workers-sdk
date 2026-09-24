---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Allow framework commands to produce Preview Build Output with the experimental config

When `cf previews deploy` invokes a framework build command, Preview intent is now preserved. Function-based `cloudflare.config.ts` files receive `isPreview: true`, and generated Build Output is marked as a Preview build.
