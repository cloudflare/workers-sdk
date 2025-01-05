---
"@cloudflare/vitest-pool-workers": patch
---

fix: Add support interception of URLs with repeated key/name in its query params.

e.g., `https://example.com/foo/bar?a=1&a=2`
