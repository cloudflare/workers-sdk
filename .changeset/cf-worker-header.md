---
"miniflare": minor
---

Add `CF-Worker` header to outgoing fetch requests in local development to match production behavior. A new optional `zone` option allows specifying the zone value for the header. When not specified, the header defaults to `${worker-name}.example.com`.
