---
"wrangler": patch
---

Respect `CLOUDFLARE_ENV` when selecting `.env.<environment>` and `.dev.vars.<environment>` files

`CLOUDFLARE_ENV` is documented as an alternative to `--env`, and the config loader already falls back to it when `--env` is not passed. But the `.env`/`.dev.vars` file lookup only looked at `--env`, so running `CLOUDFLARE_ENV=staging wrangler dev` activated the `staging` config environment while still loading the top-level `.env`/`.dev.vars` files instead of `.env.staging`/`.dev.vars.staging`.

Both lookups now fall back to `CLOUDFLARE_ENV` in the same way the config loader does. `--env` still takes precedence when both are set.
