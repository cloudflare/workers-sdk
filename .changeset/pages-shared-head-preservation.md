---
"@cloudflare/pages-shared": patch
---

Stop rewriting an asset's preservation entry on every HEAD request

Pages keeps a cache entry for each served asset so the asset can still be served after a later deployment removes it. HEAD requests rewrote that entry every time, so sites with frequent HEAD traffic made a cache write per request. HEAD requests now rewrite it only when it's missing, changed or close to expiring, the same as GET requests. Responses are unchanged.
