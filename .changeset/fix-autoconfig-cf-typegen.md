---
"@cloudflare/autoconfig": patch
---

Fix the type generation script added to TypeScript projects configured for `cf`.

The `cf-typegen` script now runs `cf workers types` instead of the unsupported `cf types` command. Projects configured for Wrangler continue to use `wrangler types`.
