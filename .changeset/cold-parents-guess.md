---
"@cloudflare/unenv-preset": patch
"wrangler": patch
---

Use more workerd native modules

Node modules `punycode`, `trace_events`, `cluster`, `wasi`, and `domains` will be used when enabled
via a compatibility flag or by default when the compatibility date is greater or equal to 2025-12-04.
