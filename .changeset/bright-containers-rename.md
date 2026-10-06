---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Use the resolved Worker name when generating default Container application names

When `wrangler deploy --name` overrides the name in the configuration, unnamed Container applications now use the override instead of the original Worker name. Explicit application names remain unchanged, avoiding collisions when the same configuration is deployed under multiple Worker names.
