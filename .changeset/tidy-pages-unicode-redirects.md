---
"@cloudflare/pages-shared": patch
"wrangler": patch
---

Encode filenames in Pages HTML redirects

Fix `wrangler pages dev` returning a 502 response when redirecting HTML paths containing Unicode characters. Keep reserved characters in filenames encoded in the redirect destination and preserve the request query string.
