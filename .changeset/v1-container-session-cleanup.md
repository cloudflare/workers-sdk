---
"@cloudflare/vite-plugin": patch
---

Delegate local Container cleanup to Miniflare

Local development and preview now let Miniflare remove application containers, networking sidecars and snapshot clone volumes. Dispose the runtime when a dev-server restart removes the Cloudflare plugin, including overlapping restarts.
