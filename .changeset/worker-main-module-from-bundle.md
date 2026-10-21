---
"@cloudflare/vite-plugin": patch
---

Fix builds failing when a framework deletes the Worker's Vite manifest

The Vite plugin now records each Worker's main module from the bundle instead of reading `.vite/manifest.json` after the build.
