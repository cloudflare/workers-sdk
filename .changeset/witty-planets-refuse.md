---
"wrangler": patch
---

refactor: add --ip argument for `wrangler pages dev` & defaults IP to `0.0.0.0`

Add new argument `--ip` for the command `wrangler pages dev`, defaults to `0.0.0.0`. The command `wrangler dev` is also defaulting to `0.0.0.0` instead of `localhost`.
