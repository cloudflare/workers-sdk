---
"wrangler": patch
---

chore: Refactor `wrangler pages dev` to use Wrangler-proper's own dev server.

This:

- fixes some bugs (e.g. not proxying WebSockets correctly),
- presents a much nicer UI (with the slick keybinding controls),
- adds features that `pages dev` was missing (e.g. `--local-protocol`),
- and reduces the maintenance burden of `wrangler pages dev` going forward.
