---
"@cloudflare/workers-shared": patch
---

fix: on a 404 from KV, we do not want the asset to stay in cache for the normal 1 year TTL. Instead we want to re-insert with a 60s TTL to revalidate and prevent a bad 404 from persisting.
