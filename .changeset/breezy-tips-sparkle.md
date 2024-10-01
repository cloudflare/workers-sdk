---
"@cloudflare/vitest-pool-workers": patch
"miniflare": patch
"wrangler": patch
---

feature: enable asset routing in the vitest integration for Workers + static assets

Integration tests (using the SELF binding) in Workers + assets projects will now return static assets if present on that path. Previously all requests went to the user worker regardless of whether static assets would have been served in production.
