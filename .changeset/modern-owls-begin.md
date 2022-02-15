---
"wrangler": patch
---

chore: enable `strict` in `tsconfig.json`

In the march towards full strictness, this enables `strict` in `tsconfig.json` and fixes the errors it pops up. A changeset is included because there are some subtle code changes, and we should leave a trail for them.
