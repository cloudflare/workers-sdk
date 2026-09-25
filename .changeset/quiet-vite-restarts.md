---
"@cloudflare/vite-plugin": patch
---

Keep dependency optimization caches stable on the first Vite dev server restart.

The first dev server restart no longer re-optimizes unchanged dependencies, including in projects without Containers. Container images are still cleaned up when the server closes, even after a config reload removes the Cloudflare plugin.
