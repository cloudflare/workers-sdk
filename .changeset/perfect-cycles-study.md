---
"wrangler": patch
---

Error if a user tries to use durable objects with a service worker

Durable Objects [require Module Workers](https://developers.cloudflare.com/workers/learning/migrating-to-module-workers/#advantages-of-migrating) to function, so we should error if we discover that a user is trying to use a durable object with a Service Worker.
