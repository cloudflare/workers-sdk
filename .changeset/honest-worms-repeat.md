---
"@cloudflare/unenv-preset": patch
---


Use the native `node:cluster` module when available.

It is enabled when the `enable_nodejs_cluster_module` compatibility flag is set.
