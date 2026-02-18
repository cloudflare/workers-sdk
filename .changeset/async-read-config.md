---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add async alternatives to config reading APIs to support future code-based config files

- Add `loadConfig` as an async alternative to `readConfig` (sync, unchanged)
- Add `experimental_loadConfig` as an async alternative to `experimental_readRawConfig` (sync, unchanged)
- Add `unstable_loadMiniflareWorkerOptions` as an async alternative to `unstable_getMiniflareWorkerOptions` (sync, unchanged)

The existing sync APIs are preserved for backwards compatibility. The new async versions will support programmatic config files (.ts/.js) in future.
