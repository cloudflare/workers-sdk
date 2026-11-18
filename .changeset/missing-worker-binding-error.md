---
"miniflare": patch
---

Name the binding and Worker when a binding refers to a Worker that isn't running

With the dev registry disabled, a service or Durable Object binding to a Worker that isn't in the Miniflare instance stopped `workerd` from starting, with an error naming internal services such as `core:user:api`. Miniflare now rejects the options with an error naming the binding and the Worker it refers to.
