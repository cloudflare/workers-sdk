---
"miniflare": patch
---

Start even when a binding refers to a Worker that isn't running

A service, Durable Object or Workflow binding to a Worker that isn't running now always fails only when it's used. Before, with the dev registry disabled, as in the Vitest plugin, it stopped `workerd` from starting, with an error naming an internal service such as `core:user:api`.
