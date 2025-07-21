---
"@cloudflare/vite-plugin": patch
"@cloudflare/containers-shared": patch
"wrangler": patch
---

feat(vite-plugin): Add containers support in `vite dev`

Adds support for Cloudflare Containers in `vite dev`. Please note that at the time of this PR a container image can only specify the path to a `Dockerfile`. Support for registry links will be added in a later version, as will containers support in `vite preview`.
