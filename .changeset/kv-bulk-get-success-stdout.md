---
"wrangler": patch
---

Fix `wrangler kv bulk get` printing "Success!" to stdout, which corrupted JSON output when piped to tools like `jq`
