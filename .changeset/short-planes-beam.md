---
"@cloudflare/vite-plugin": patch
---

feat(vite-plugin): Add containers support in `vite preview`

Adds support for Cloudflare Containers in `vite preview`. Please note that at the time of this PR a container image can only specify the path to a `Dockerfile`. Support for registry links will be added in a later version.
