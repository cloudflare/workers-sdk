---
"wrangler": patch
---

Adds the logic of @cloudflare/pages-functions-compiler directly into wrangler. This generates a Worker from a folder of functions.

Also adds support for sourcemaps and automatically watching dependents to trigger a re-build.
