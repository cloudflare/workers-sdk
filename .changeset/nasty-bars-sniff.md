---
"@cloudflare/vite-plugin": patch
---

Set `target` in `optimizeDeps.esbuildOptions` to `es2022`. This fixes a bug where the target for prebundled dependencies did not match the build target.
