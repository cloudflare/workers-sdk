---
"@cloudflare/pages-shared": patch
"@cloudflare/workers-shared": patch
"miniflare": patch
"wrangler": patch
---

Normalize relative redirect pathnames consistently across Pages and Workers assets

Relative `_redirects` targets now use shared pathname normalization after placeholder replacement, keeping repeated separators within the site's path. Explicit external targets (including scheme-less URLs such as `//example.com/path`), query values and fragments retain their contents.
