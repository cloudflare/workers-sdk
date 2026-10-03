---
"@cloudflare/codemods": patch
---

Avoid a manual migration TODO when an R2 binding uses the same production and preview bucket name.

`cf migrate` now requests manual review only when the preview bucket name differs from the production bucket name.
