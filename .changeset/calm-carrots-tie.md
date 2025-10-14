---
"@cloudflare/unenv-preset": patch
---

Use workerd `node:console` when it is available

It is enabled when the `enable_nodejs_console_module` compatibility flag is set.
This flag defaults to true when `nodejs_compat` is turned on and the date is >= 2025-09-21.
