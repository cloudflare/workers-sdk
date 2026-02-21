---
"@cloudflare/unenv-preset": minor
---

Use the native workerd `node:perf_hooks` module and `Performance` global classes when available

They are enabled when the `enable_nodejs_perf_hooks_module` and `enable_global_performance_classes` compatibility flags are set.
This feature is currently experimental and requires the above flags and `experimental` compatibility flags to be set.
