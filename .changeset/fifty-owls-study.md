---
"@cloudflare/pages-shared": patch
---

refactor: Store asset key instead of body in preservation cache

- Add HTTP method to cache key to prevent returning null bodies in cached GET requests that follow a HEAD request
- Only write unchanged assets to preservation cache every 24-36 hours instead of on every request
