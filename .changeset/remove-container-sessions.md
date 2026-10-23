---
"miniflare": patch
---

Remove local Containers once Miniflare stops using them

Miniflare now removes the application containers, networking sidecars, and snapshot clone volumes that workerd creates for Container-enabled Durable Objects when a reload changes the Container configuration, when Miniflare is disposed, and when its process exits. Previously, they were left running after workerd stopped. Containers keep running across reloads that leave the Container configuration unchanged, and directory snapshots are kept.
