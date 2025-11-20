---
"@cloudflare/unenv-preset": patch
"wrangler": patch
---

Use the native `node:domain` module when available

It is enabled when the `enable_nodejs_domain_module` compatibility flag is set.
