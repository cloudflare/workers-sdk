---
"wrangler": patch
---

fix: remove confusing `--local` messaging from `wrangler pages dev`

Running `wrangler pages dev` would previously log a warning saying `--local is no longer required` even though `--local` was never set. This change removes this warning.
