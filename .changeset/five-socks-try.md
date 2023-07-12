---
"wrangler": patch
---

fix: remove --experimental-backend from `wrangler d1 migrations apply`

This PR removes the need to pass a `--experimental-backend` flag when running migrations against an experimental D1 db.

Closes #3596
