---
"@cloudflare/unenv-preset": minor
---

Use the native workerd `node:perf_hooks` module and `Performance` global classes when available

They are enabled when the `enable_nodejs_perf_hooks_module` compatibility flag is set. This feature is currently experimental and requires the above flag and `experimental` compatibility flag to be set.
