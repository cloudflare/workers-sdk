---
"miniflare": patch
---

Start even when a binding refers to a Worker that isn't running

A service, Durable Object or Workflow binding to a Worker that isn't running now always fails only when it's used. Before, Miniflare failed to start when the dev registry was disabled, as it is in the Vitest plugin.
