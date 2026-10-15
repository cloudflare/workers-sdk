---
"@cloudflare/autoconfig": patch
---

Install `@cloudflare/vite-plugin@^2.0.0-beta.v.0` when autoconfiguring projects for cf

Newly configured cf projects use a compatible Vite plugin v2 release, starting at `2.0.0-beta.v.0`, instead of following the moving `beta` tag. Wrangler autoconfiguration continues to install the latest stable release.
