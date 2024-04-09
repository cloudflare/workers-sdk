---
"wrangler": minor
---

feat: Simplify `wrangler pages download config`:

- If preview and production are currently equal, don't generate a production override
- Don't include inheritable keys in the production override if they're equal to production
