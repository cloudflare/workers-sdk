---
"@cloudflare/unenv-preset": patch
---

Add support for the native `node:v8` module from workerd when the `enable_nodejs_v8_module` and `experimental` compatibility flags are enabled

This feature is currently experimental and requires `nodejs_compat`, `experimental`, and `enable_nodejs_v8_module` compatibility flags to be set.
