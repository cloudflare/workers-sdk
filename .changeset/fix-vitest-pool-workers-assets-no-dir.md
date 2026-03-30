---
"wrangler": patch
---

Fix `getPlatformProxy` and `unstable_getMiniflareWorkerOptions` crashing when `assets` is configured without a `directory`

`getPlatformProxy` and `unstable_getMiniflareWorkerOptions` now skip asset setup when the config has an `assets` block but no `directory` — instead of throwing "missing required `directory` property". This happens when an external tool like `@cloudflare/vite-plugin` handles asset serving independently.
