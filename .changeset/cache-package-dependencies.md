---
"@cloudflare/deploy-helpers": patch
---

Cache package dependency collection results to avoid redundant filesystem walks

`collectPackageDependencies` now accepts an optional options object as its second parameter instead of a positional `excludePackages` array. The options object supports `excludePackages` (moved from the previous positional parameter) and a new `cacheDir` field. When `cacheDir` is provided, collected results are persisted to disk and reused on subsequent calls as long as neither `package.json` nor the project's lockfile have been modified. This speeds up repeated deploys when dependencies haven't changed.
