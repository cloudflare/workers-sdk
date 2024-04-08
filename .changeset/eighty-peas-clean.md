---
"wrangler": patch
---

fix: Improvements to `--init-from-dash`

Adds user-specified CPU limit to `wrangler.toml` if one exists. Excludes `usage_model` from `wrangler.toml` in all cases, since this field is deprecated and no longer used.
