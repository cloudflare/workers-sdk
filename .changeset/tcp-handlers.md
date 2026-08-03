---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
---

Add `tcp_handlers` configuration for local development raw TCP ingress

You can now configure a Worker to receive raw TCP connections during `wrangler dev`, delivered directly to the Worker's `connect(socket, env, ctx)` handler:

```jsonc
{
  "tcp_handlers": [{ "port": 5432 }]
}
```

Each entry opens a listening TCP socket on `127.0.0.1` (or the given `address`) that forwards incoming connections straight to the Worker, bypassing the local dev HTTP entry point. This requires the `experimental` compatibility flag.
