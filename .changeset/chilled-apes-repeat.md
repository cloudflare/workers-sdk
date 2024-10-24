---
"wrangler": patch
---

fix: synchronize observability settings during versions deploy

When running `wrangler versions deploy`, wrangler will now update observability settings in addition to logpush and `tail_consumers`. Unlike `wrangler deploy`, it will not disable observability when observability is undefined in wrangler.toml
