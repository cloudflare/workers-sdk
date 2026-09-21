---
"@cloudflare/vite-plugin": patch
---

Fix Vite Build Output builds when `publicDir` is the project root

The experimental Build Output integration now skips Vite's recursive public-directory copy for this configuration and adds missing public files after generated client output is written. This prevents `.cloudflare` output from being copied into itself while preserving generated assets.
