---
"wrangler": patch
---

fix: don't fetch zone id for `wrangler dev --local`

We shouldn't try to resolve a domain/route to a zone id when starting in local mode (since there may not even be network).
