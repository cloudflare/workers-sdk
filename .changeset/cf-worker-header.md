---
"miniflare": minor
---

Add `CF-Worker` header to outgoing fetch requests in local development to match production behavior. The header value is set to the worker's name, helping developers test and debug scenarios that depend on this header.
