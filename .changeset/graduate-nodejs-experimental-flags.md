---
"@cloudflare/unenv-preset": minor
---

Graduate experimental Node.js module flags to date-gated flags

The following Node.js module compatibility flags are no longer experimental and are now automatically enabled for workers using `nodejs_compat` with a compatibility date of `2026-03-17` or later: `perf_hooks`, `v8`, `tty`, `child_process`, `worker_threads`, `readline`, and `repl`. Each flag can still be explicitly enabled or disabled via the corresponding `enable_`/`disable_` compatibility flags.
