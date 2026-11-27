---
"wrangler": patch
---

Warn when running `wrangler delete` without `--env` on multi-environment configs

When multiple environments are defined in the Wrangler configuration file and `--env` is not specified, `wrangler delete` now emits the same warning as `wrangler deploy` and `wrangler secret delete` so users do not unintentionally target the top-level Worker.
