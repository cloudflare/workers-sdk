---
"miniflare": patch
---

Restore cross-process service bindings after a machine wakes from sleep

Workers running in separate `wrangler dev` or Vite dev sessions now reconnect automatically after the machine wakes. Previously, service bindings could return `Worker "<name>" not found` until the serving process reloaded or restarted.
