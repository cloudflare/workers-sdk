---
"@cloudflare/workers-shared": patch
"miniflare": patch
"wrangler": patch
---

fix: remove filepath encoding on asset upload and handle sometimes-encoded characters

Some characters like [ ] @ are encoded by encodeURIComponent() but are often requested at an unencoded URL path.
This change will make assets with filenames with these characters accessible at both the encoded and unencoded paths,
but to use the encoded path as the canonical one, and to redirect requests to the canonical path if necessary.
