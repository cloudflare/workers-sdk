---
"@cloudflare/vite-plugin": patch
---

Statically replace the value of `process.env.NODE_ENV` in development when the `nodejs_compat` compatibility flag is enabled.
Previously, this was replaced at build time when `nodejs_compat` was enabled and at dev and build time when `nodejs_compat` was not enabled.
