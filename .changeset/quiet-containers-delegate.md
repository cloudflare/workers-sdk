---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Remove Container networking sidecars and snapshot clone volumes in local development

Wrangler and the Vite plugin removed only the application containers of Container-enabled Durable Objects, found by image tag, and left behind the networking sidecars and snapshot clone volumes that workerd also creates. They now leave cleanup to Miniflare, which removes all of these when the Container configuration changes, such as after a rebuild, when local development stops, and when the process exits.
