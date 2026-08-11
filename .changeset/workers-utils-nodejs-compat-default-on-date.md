---
"@cloudflare/workers-utils": patch
---

Add `NODEJS_COMPAT_DEFAULT_ON_DATE` and `isNodejsCompatDefaultOn()`

These expose the compatibility date on which workerd started enabling `nodejs_compat` by default, so that the tools which generate or interpret Wrangler configurations do not each hardcode it.
