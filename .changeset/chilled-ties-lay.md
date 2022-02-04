---
"wrangler": patch
---

fix: ensure pages routes are defined correctly

In e151223 we introduced a bug where the RouteKey was now an array rather than a simple URL string. When it got stringified into the routing object these were invalid.
E.g. `[':page*', undefined]` got stringified to `":page*,"` rather than `":page*"`.

Fixes #379
