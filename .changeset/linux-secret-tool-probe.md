---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Fix `wrangler login --use-keyring` incorrectly reporting that `secret-tool` is missing on Linux

Libsecret's `secret-tool` does not support `--version`; it prints usage and exits 2, which Wrangler previously interpreted as unavailable. Wrangler now reports it missing only when launching the executable fails.
