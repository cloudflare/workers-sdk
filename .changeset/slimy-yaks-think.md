---
"wrangler": patch
---

fix: Throw error if both `directory` and `command` is specified for `pages dev`

The previous behavior was to silently ignore the `command` argument.
