---
"wrangler": patch
"@cloudflare/pages-functions": patch
---

Ship `using` and `await using` declarations to the runtime as written, for smaller Worker bundles

Workers and Pages Functions that use explicit resource management no longer carry about 1 KB of bundled helper code to emulate it. workerd supports `using` and `await using` natively at every compatibility date, so `wrangler deploy`, `wrangler versions upload` and Pages Functions builds now leave these declarations untouched.
