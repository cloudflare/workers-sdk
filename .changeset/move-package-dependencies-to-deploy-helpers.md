---
"@cloudflare/deploy-helpers": minor
---

Export `collectPackageDependencies` for npm dependency metadata collection

The package dependency discovery logic (collecting installed npm package names and versions from a project's `package.json`) is now owned by `deploy-helpers` and called internally during deploy and version uploads, rather than being pre-computed in wrangler and passed through as a prop.
