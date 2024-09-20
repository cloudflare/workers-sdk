---
"@cloudflare/workers-shared": patch
"miniflare": patch
"wrangler": patch
---

fix: remove filepath encoding on asset upload and handle sometimes-encoded characters

Some characters like [ ] @ are encoded by encodeURIComponent() but are often requested at an unencoded filepath.
This change will make assets with filenames with these characters accessible at both the encoded and unencoded paths,
but use the encoded path as the canonical one.
