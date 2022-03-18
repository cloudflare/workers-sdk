---
"wrangler": patch
---

Error if a user tries to implement durable objects with a service worker

You can only implement Durable Objects in [Module Workers](https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/#advantages-of-migrating), so we should error if we discover that a user is trying to implement a durable object alongside a Service Worker.
