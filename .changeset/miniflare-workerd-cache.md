---
"miniflare": minor
---

Serve the local Cache API with workerd's native cache service

`caches.default` and `caches.open()` are now served by workerd's `cache` service, the same Cache API backend `workerd serve` uses, instead of Miniflare's own Durable Object. Entries are files in the cache's persistence directory and survive restarts as before; entries cached by earlier versions are not migrated.

`cache.put()` now rejects a response whose `Content-Length` doesn't match its body, only HTTP dates are accepted in `Expires` and `Last-Modified`, and a cache error rejects the call rather than missing. `cacheAPI: false` still makes every operation a no-op.
