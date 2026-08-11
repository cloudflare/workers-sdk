---
"@cloudflare/workers-utils": minor
---

Add `NODEJS_COMPAT_DEFAULT_ON_DATE`, `NODEJS_COMPAT_V2_SWITCH_OVER_DATE`, `isNodejsCompatDefaultOn()` and `resolveNodejsCompat()`

These expose the compatibility dates on which workerd started enabling `nodejs_compat` by default and on which `nodejs_compat` started implying `nodejs_compat_v2`, along with the resolution of both flags from a compatibility date and a set of compatibility flags, so that the tools which generate or interpret Wrangler configurations do not each reimplement it.
