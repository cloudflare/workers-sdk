---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:worker_threads` module from workerd when the `enable_nodejs_worker_threads_module` compatibility flag is enabled.

This feature is currently experimental and requires `nodejs_compat`, `experimental`, and `enable_nodejs_worker_threads_module` compatibility flags to be set.
