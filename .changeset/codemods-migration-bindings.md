---
"@cloudflare/codemods": patch
---

Preserve Worker targets and skip redundant R2 preview reviews during migration

Service bindings, dispatch outbound targets, and tail consumers keep their configured Worker names when a legacy environment key is present. R2 bindings only request preview bucket review when the preview name differs from production.
