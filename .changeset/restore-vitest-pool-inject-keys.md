---
"@cloudflare/vitest-pool-workers": minor
---

Restore typed `inject()` keys in `cloudflareTest()` pool options

When a project's Vitest `ProvidedContext` augmentation is visible to `@cloudflare/vitest-pool-workers`, `inject()` inside `cloudflareTest()` options now infers values from those keys and rejects misspelled keys again. If pnpm resolves a separate Vitest copy and the augmented keys collapse to `never`, the type falls back to the wider string-key signature to avoid reintroducing the cross-copy mismatch.
