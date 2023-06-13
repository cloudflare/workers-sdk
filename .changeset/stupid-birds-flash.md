---
"@cloudflare/pages-shared": patch
"wrangler": patch
---

chore: upgrade `miniflare` to `3.0.1`

This version ensures root CA certificates are trusted on Windows.
It also loads extra certificates from the `NODE_EXTRA_CA_CERTS` environment variable,
allowing `wrangler dev` to be used with Cloudflare WARP enabled.
