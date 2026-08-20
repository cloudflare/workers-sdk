---
"wrangler": patch
---

Respect `CLOUDFLARE_ENV` when selecting `.env.<environment>` and `.dev.vars.<environment>` files

`CLOUDFLARE_ENV` is documented as an alternative to `--env`, and the config loader already falls back to it when `--env` is not passed. The `.env` / `.dev.vars` lookups only looked at `--env`, so `CLOUDFLARE_ENV=staging wrangler dev` activated the staging config environment while still loading the top-level env files.

Those lookups now fall back to `CLOUDFLARE_ENV` the same way the config loader does. `--env` still wins when both are set.
