---
"wrangler": patch
---

Preserve `using` and `await using` declarations when bundling a Worker

Wrangler bundles at the `es2024` target, so esbuild was lowering explicit resource management syntax into `__using` and `__callDispose` helpers, roughly 1 KB of polyfill for a feature workerd already runs at every compatibility date. Wrangler now tells esbuild that `using` is supported, the same way it already does for source phase imports, so these declarations reach the runtime as written.
