---
"@cloudflare/unenv-preset": patch
---

Use the native `node:http2` when available.

It is enabled starting on 2025-09-01 or when the `enable_nodejs_http2_module` compatibility flag is set.
