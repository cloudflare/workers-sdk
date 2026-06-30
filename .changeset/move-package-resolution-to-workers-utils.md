---
"@cloudflare/workers-utils": minor
---

Export `getInstalledPackageVersion`, `getPackagePath`, and `isPackageInstalled` utilities

Package resolution helpers that were previously internal to `@cloudflare/autoconfig` are now exported from `@cloudflare/workers-utils` so they can be shared across packages without pulling in the full autoconfig dependency.

`getPackagePath` now also consistently returns a directory path. Previously the fallback resolution strategy could return a file path (the package entry point) instead of its containing directory.
