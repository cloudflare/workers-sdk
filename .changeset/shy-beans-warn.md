---
"@cloudflare/vitest-pool-workers": patch
---

fix the Vitest integration to support Workers that want Node.js compatibility is only v1 in production

It does this by adding the `nodejs_compat_v2` flag (if missing) and removing `no_nodejs_compat_v2` flag (if found).

This does mean that the Vitest tests are running with a slightly different environment to production, but this has always been the case in other ways.
