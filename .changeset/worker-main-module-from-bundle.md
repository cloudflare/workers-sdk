---
"@cloudflare/vite-plugin": patch
---

Fix builds failing when a framework deletes the Worker's Vite manifest

The Vite plugin now records each Worker's main module from the bundle instead of reading `.vite/manifest.json` after the build. Frameworks such as React Router delete the Vite manifests they enable internally once their own build finishes, which previously made the build fail with an `ENOENT` error.
