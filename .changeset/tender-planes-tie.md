---
"wrangler": patch
---

Error if the user is trying to implement DO's in a service worker

Durable Objects can only be implemented in Module Workers, so we should throw if we detect that
the user is trying to implement a Durable Object but their worker is in Service Worker format.
