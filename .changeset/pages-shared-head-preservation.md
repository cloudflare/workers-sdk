---
"@cloudflare/pages-shared": patch
---

Stop HEAD requests from writing to the asset preservation cache

The asset server wrote the preservation cache entry for an asset whenever `cache.match()` found no entry for the request. The Cache API never matches a HEAD request, so every HEAD request served by the asset server wrote the entry again. Only GET requests write it now.
