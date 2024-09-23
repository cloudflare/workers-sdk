---
"miniflare": patch
"wrangler": patch
---

fix: ensure instances listening on `localhost:0` are accessible on both IPv4 and IPv6 loopback addresses

Previously, listening on `localhost:0` would actually listen on two different random ports for IPv4 and IPv6 loopback addresses. This change ensures the dev server always listens on the same port for both interfaces.
