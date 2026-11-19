---
"miniflare": patch
---

Start even when a binding refers to a Worker that isn't running, with the dev registry disabled

With the dev registry disabled, as in the Vitest plugin, a service, Durable Object or Workflow binding to a Worker that isn't part of the Miniflare instance stopped `workerd` from starting, with an error naming an internal service such as `core:user:api`. Miniflare now starts, and the binding fails only when it's used, as it already did with the dev registry enabled.
