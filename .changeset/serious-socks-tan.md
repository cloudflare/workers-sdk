---
"wrangler": patch
---

fix: make `wrangler types` pick up secrets from `.dev.vars`

Make sure that the `wrangler types` command correctly picks up
secrets defined in `.dev.vars` and includes them in the generated
file (marking them as generic `string` types of course)
