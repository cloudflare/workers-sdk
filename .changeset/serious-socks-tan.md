---
"wrangler": patch
---

fix: make the `wrangler types` command pick up local secret keys from `.dev.vars`

Make sure that the `wrangler types` command correctly picks up
secret keys defined in `.dev.vars` and includes them in the generated
file (marking them as generic `string` types of course)
