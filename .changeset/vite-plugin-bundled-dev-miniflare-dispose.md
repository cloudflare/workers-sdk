---
"@cloudflare/vite-plugin": patch
---

Keep Miniflare alive when a build runs during `serve` (Vite `experimental.bundledDev`)

The plugin used the `buildEnd` hook as its signal that the dev server was closing, and disposed the Miniflare instance there. Vite's `experimental.bundledDev` runs a Rolldown build pass *during* `serve`, which fires `buildEnd` while the dev server is still live — so Miniflare was torn down mid-serve and the next request failed with `Expected \`miniflare\` to be defined`.

During `serve`, Miniflare is now disposed from a patched `server.close` (mirroring the existing `server.restart` patch) instead of from `buildEnd`, so build passes that run while serving no longer dispose it. Behaviour is unchanged for production builds, dev-server restarts (Miniflare stays warm), and forceful exits (still covered by the existing `exit` handler).
