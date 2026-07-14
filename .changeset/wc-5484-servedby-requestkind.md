---
"@cloudflare/workers-shared": patch
---

Emit `servedBy` and `requestKind` analytics from the Workers Assets asset worker

Real asset hits and SPA or 404 fallbacks previously logged the same fields. The asset worker now records what served the response and whether the request was a navigation or subresource.
