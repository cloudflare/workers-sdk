---
"wrangler": patch
---

feat: implement support for service bindings

This adds experimental support for service bindings, aka worker-to-worker bindings. It's lets you "call" a worker from another worker, without incurring any network cost, and (ideally) with much less latency. To use it, define a `[services]` field in `wrangler.toml`, which is a map of bindings to worker names (and environment). Let's say you already have a worker named "my-worker" deployed. In another worker's configuration, you can create a service binding to it like so:

```toml
[[services]]
binding = "MYWORKER"
service = "my-worker"
environment = "production" # optional, defaults to the worker's `default_environment` for now
```

And in your worker, you can call it like so:

```js
export default {
  fetch(req, env, ctx) {
    return env.MYWORKER.fetch(new Request("http://domain/some-path"));
  },
};
```

Fixes https://github.com/cloudflare/wrangler2/issues/1026
