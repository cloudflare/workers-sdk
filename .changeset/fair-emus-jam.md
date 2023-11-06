---
"miniflare": minor
---

feat: add support for wrapped bindings

This change adds a new `wrappedBindings` worker option for configuring
`workerd`'s [wrapped bindings](https://github.com/cloudflare/workerd/blob/bfcef2d850514c569c039cb84c43bc046af4ffb9/src/workerd/server/workerd.capnp#L469-L487).
These allow custom bindings to be written as JavaScript functions accepting an
`env` parameter of "inner bindings" and returning the value to bind. For more
details, refer to the [API docs](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/README.md#core).
