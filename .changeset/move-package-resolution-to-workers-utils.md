---
"@cloudflare/workers-utils": minor
---

Export `getInstalledPackageVersion`, `getPackagePath`, and `isPackageInstalled` utilities

Package resolution helpers that were previously internal to `@cloudflare/autoconfig` are now exported from `@cloudflare/workers-utils` so they can be shared across packages without pulling in the full autoconfig dependency.
