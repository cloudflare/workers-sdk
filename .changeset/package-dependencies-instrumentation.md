---
"wrangler": minor
"@cloudflare/workers-utils": patch
---

Send npm package dependency metadata with worker uploads

Wrangler now collects npm package dependency information from the project's `package.json` at deploy and version upload time, and includes it in the upload metadata sent to the Cloudflare API. This enables dependency analytics and future features like vulnerability alerting.

The collected data includes the package name, the version constraint from `package.json`, and the exact installed version from `node_modules`. Both `dependencies` and `devDependencies` are included, while workspace packages, private packages, and unresolvable packages are excluded. The list is capped at 200 entries per upload.

To opt out, set `dependencies_instrumentation` to `false` in your Wrangler configuration file:

```json
{
	"dependencies_instrumentation": false
}
```
