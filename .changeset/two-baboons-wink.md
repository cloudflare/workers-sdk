---
"@cloudflare/vite-plugin": patch
---

Normalize the return value of `getAssetsDirectory()` with `vite.normalizePath()` to ensure `assets.directory` in the output `wrangler.json` always uses forward slashes
