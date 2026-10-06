---
"wrangler": patch
---

Remove unresolved private build dependencies from Wrangler's published declaration surface

Wrangler now inlines declaration dependencies that are safe to bundle, keeps `@cloudflare/workers-utils` external in declarations as a declared dependency so nominal symbol identities remain shared, while continuing to bundle its runtime into Wrangler.
