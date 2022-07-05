---
"wrangler": patch
---

feat: bind a worker with `[worker_namespaces]`

This feature les you bind a worker to a dynamic dispatch namespaces, which may have other workers bound inside it. (See https://blog.cloudflare.com/workers-for-platforms/). Inside your `wrangler.toml`, you would add

```toml
[[worker_namespaces]]
binding = 'dispatcher' # available as env.dispatcher in your worker
namespace = 'namespace-name' # the name of the namespace being bound
```

Based on work by @aaronlisman in https://github.com/cloudflare/wrangler2/pull/1310
