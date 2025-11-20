---
"@cloudflare/unenv-preset": patch
"wrangler": patch
---

Use the native `node:wasi` module when available

It is enabled when the `enable_nodejs_wasi_module` compatibility flag is set.
