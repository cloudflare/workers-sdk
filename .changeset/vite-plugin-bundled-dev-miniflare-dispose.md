---
"@cloudflare/vite-plugin": patch
---

Fix compatibility with Vite's `experimental.bundledDev` option. Keep Miniflare, containers, and tunnels alive when a build runs in dev.

The plugin used the `buildEnd` hook as its signal that the dev server was closing, and tore down its dev resources there. Vite's `experimental.bundledDev` runs a build pass _during_ `serve`, which fires `buildEnd` while the dev server is still live — so Miniflare was disposed (the next request failed with `Expected \`miniflare\` to be defined`), locally-built container images were removed, and any active tunnel was closed, all mid-serve.

During `serve`, these resources are now torn down from a patched `server.close`. We will replace server patching with first-class APIs when they are [added to Vite](https://github.com/vitejs/vite/issues/22913).
