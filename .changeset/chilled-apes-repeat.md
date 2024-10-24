---
"wrangler": patch
---

fix: synchronize observability settings during `wrangler versions deploy`

When running `wrangler versions deploy`, Wrangler will now update `observability` settings in addition to `logpush` and `tail_consumers`. Unlike `wrangler deploy`, it will not disable observability when `observability` is undefined in `wrangler.toml`.
