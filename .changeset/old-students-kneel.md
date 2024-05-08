---
"@cloudflare/pages-shared": patch
---

fix: Remove request method from cache key

Reverts a change that added the request method to the cache key when reading/writing to cache.
