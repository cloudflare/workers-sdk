---
"@cloudflare/pages-shared": patch
---

fix: Requests for Cloudflare Pages which match against a `_headers` rule now match regardless of the incoming request's port
