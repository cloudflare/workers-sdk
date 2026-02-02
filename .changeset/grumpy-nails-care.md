---
"@cloudflare/vite-plugin": patch
---

Always emit a `.assetsignore` file in the client output directory.

Previously, we would emit a `.assetsignore` file in the client output directory only if the client output included a `wrangler.json` file.
We now always emit it, which prevents a `wrangler.json` file being deployed as an asset if it is copied into this directory by mistake.
