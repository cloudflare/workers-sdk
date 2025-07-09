---
"@cloudflare/pages-shared": patch
---

Add `x-cf-pages-analytics` header when Web Analytics token is injected

- Emit `x-cf-pages-analytics: 1` header when analytics script is added to HTML responses
- Add comprehensive tests covering HTML with/without body, non-HTML responses, and missing analytics config
- Header indicates when analytics injection is attempted regardless of HTMLRewriter success
