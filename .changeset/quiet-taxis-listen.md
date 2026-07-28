---
"@cloudflare/vitest-pool-workers": minor
---

Add a `verbose` option to `cloudflareTest()` and `cloudflarePool()` configuration

Set `verbose: false` to suppress verbose workerd runtime logs, such as caught Durable Object RPC errors. The option defaults to `true` to preserve existing output.
