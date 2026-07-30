---
"wrangler": patch
---

Fix `wrangler triggers deploy` to use Vite-generated redirected configuration

The command now reads `.wrangler/deploy/config.json`, matching `wrangler deploy` and `wrangler versions upload`, so generated Worker names and trigger settings are applied.
