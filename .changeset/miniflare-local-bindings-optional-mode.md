---
"miniflare": patch
---

Let `resolveLocalBindings()` accept an undefined `mode`

When `mode` is `undefined`, the warning about secrets that have no local value names only `.dev.vars`, `.env.local`, and `.env`.
