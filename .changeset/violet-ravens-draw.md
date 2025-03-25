---
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
"wrangler": patch
---

Remove `NodeJSCompatModule`. This was never fully supported, and never worked for deploying Workers from Wrangler.
