---
"wrangler": patch
---

fix: use `config.dev.ip` when provided

Because we'd used a default for 0.0.0.0 for the `--ip` flag, `wrangler dev` was overriding the value specified in `wrangler.toml` under `dev.ip`. This fix removes the default value (since it's being set when normalising config anyway).

Fixes https://github.com/cloudflare/wrangler2/issues/1714
