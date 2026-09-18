---
"@cloudflare/build-output-utils": patch
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Fix cf builds for static projects that serve assets from the project root

The experimental Build Output path now omits the reserved `.cloudflare` directory when the project root is used for static assets. This prevents recursive output copying in Wrangler and the Cloudflare Vite plugin while preserving the existing behaviour for other asset directories.
