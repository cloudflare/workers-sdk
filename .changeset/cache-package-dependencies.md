---
"@cloudflare/deploy-helpers": patch
---

Cache package dependency collection results to avoid redundant filesystem walks

`collectPackageDependencies` now accepts an optional `cacheDir` parameter. When provided, collected results are persisted to disk and reused on subsequent calls as long as neither `package.json` nor the project's lockfile have been modified. This speeds up repeated deploys when dependencies haven't changed.
