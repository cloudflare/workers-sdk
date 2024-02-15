---
"wrangler": patch
---

fix: make sure `getPlatformProxy` produces a production-like `caches` object

make sure that the `caches` object returned to `getPlatformProxy` behaves
in the same manner as the one present in production (where calling unsupported
methods throws a helpful error message)

note: make sure that the unsupported methods are however not included in the
`CacheStorage` type definition
