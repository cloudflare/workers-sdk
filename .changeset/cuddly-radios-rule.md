---
"create-cloudflare": patch
---

fix: bump `vitest-pool-workers` version range in templates

This resolves [#7815](https://github.com/cloudflare/workers-sdk/issues/7815), where users encountered an error about missing `nodejs_compat` or `nodejs_compat_v2` compatibility flags when running Vitest on a fresh Hello World project created with `create-cloudflare`.
