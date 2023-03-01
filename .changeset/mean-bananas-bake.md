---
"wrangler": patch
---

fix: Bring `pages dev` logging in line with `dev` proper's

`wrangler pages dev` now defaults to logging at the `log` level (rather than the previous `warn` level), and the `pages` prefix is removed.
