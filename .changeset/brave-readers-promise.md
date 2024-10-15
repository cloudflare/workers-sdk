---
"wrangler": patch
---

fix: make `wrangler dev --remote` respect wrangler.toml's `account_id` property.

This was a regression in the `--x-dev-env` flow recently turned on by default.
