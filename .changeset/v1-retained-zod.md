---
"@cloudflare/vite-plugin": patch
---

Update the retained asset configuration validator to Zod 4.6.6

The Vite plugin validates `_headers` and `_redirects` through its private workers-shared package. Update that bundled copy to address excessive memory consumption when validating oversized collections.
