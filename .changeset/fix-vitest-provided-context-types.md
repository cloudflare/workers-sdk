---
"@cloudflare/vitest-pool-workers": patch
---

fix: Widen `WorkerPoolOptionsContext.inject` type to avoid `ProvidedContext` mismatch

Previously, calling `inject()` inside `cloudflareTest()` pool options could fail with a type error when your project's `ProvidedContext` augmentation wasn't visible to the pool plugin. The `inject` parameter now accepts any string key and returns `unknown`, so provided-context values from `globalSetup()` type-check correctly regardless of how your package manager resolves dependencies.
