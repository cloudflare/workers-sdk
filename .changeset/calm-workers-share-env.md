---
"wrangler": minor
---

Support `--env-file` in the experimental `cf-wrangler dev` delegate

Wrangler-bundled projects can now use `cf dev -- --env-file ../../.env` to load a shared development file outside the project directory without enabling `CLOUDFLARE_INCLUDE_PROCESS_ENV`. Repeat `--env-file` to load multiple files, with later files overriding earlier values.
