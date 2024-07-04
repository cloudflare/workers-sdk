---
"wrangler": patch
---

fix: Simplify `wrangler pages download config`:

- Don't include inheritable keys in the production override if they're equal to production
- Only create a preview environment if needed, otherwise put the preview config at the top level
