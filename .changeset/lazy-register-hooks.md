---
"@cloudflare/vite-plugin": patch
---

Fix load time crash on Node.js versions earlier than 22.15

The plugin eagerly imported `registerHooks` from `node:module`, which only exists on Node.js v22.15.0+. `registerHooks` is now read lazily, meaning that missing support is only surfaced when using `experimental.newConfig`.
