---
"@cloudflare/unenv-preset": patch
---

Use the native `node:punycode` module when available.

It is enabled when the `enable_nodejs_punycode_module` compatibility flag is set.
