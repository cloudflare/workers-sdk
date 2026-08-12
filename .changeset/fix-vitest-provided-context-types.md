---
"@cloudflare/vitest-pool-workers": patch
---

Widen `WorkerPoolOptionsContext.inject` type to avoid `ProvidedContext` mismatch

Previously, calling `inject()` inside `cloudflareTest()` pool options could fail with a type error when your project's `ProvidedContext` augmentation wasn't visible to the pool plugin. The `inject` parameter now accepts any string key and is generic (`inject<T>(key)`), defaulting to `unknown` when no type argument is provided. This lets you opt in to concrete types (e.g. `inject<number>("port")`) while avoiding the cross-copy `ProvidedContext` mismatch that occurred when pnpm resolved separate virtual-store instances of vitest.
