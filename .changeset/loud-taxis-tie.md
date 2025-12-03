---
"@cloudflare/unenv-preset": patch
---

Use the native workerd `perf_hooks` modules when available

They are enabled when the `enable_nodejs_perf_hooks_module` compatibility flag is set.
