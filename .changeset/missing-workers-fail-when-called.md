---
"miniflare": patch
---

Fail calls to Workers that aren't running when the dev registry is disabled, rather than failing to start

With the dev registry disabled, as in the Vitest plugin, a service, Durable Object or Workflow binding to a Worker outside the Miniflare instance stopped `workerd` from starting, with an error naming internal services such as `core:user:api`. These bindings now go through the dev registry proxy as they do with the dev registry enabled, so Miniflare starts and a call fails with `Worker "api" not found. Make sure it is running locally.`
