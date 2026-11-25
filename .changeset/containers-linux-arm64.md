---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Accept `linux/arm64` images in `wrangler containers push` and `wrangler containers build`

`wrangler containers push` now accepts local images built for `linux/amd64` or `linux/arm64`. `wrangler containers build --platform` accepts the same two platforms. The default platform is still `linux/amd64`.
