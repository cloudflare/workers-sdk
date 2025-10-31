---
"@cloudflare/unenv-preset": patch
---

Use the native `node:domain` module when available

This native feature is enabled when the enable_nodejs_domain_module compatibility flag is set.

It is currently experimental so it must also have the `experimental` compatibility flag set,
which means it cannot be deployed to production for most accounts.
