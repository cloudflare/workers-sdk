---
"miniflare": minor
---

Remove `assets.hasUserWorker` and infer assets-only Workers.

As in `@cloudflare/config`, a Worker with `assets` and no code (no `manifest` or `legacy.serviceWorkerScript`) is now assets-only, and Miniflare runs an internal placeholder module for it. This is a breaking change to the experimental configuration API: remove `assets.hasUserWorker`, and omit `manifest` for assets-only Workers instead of passing a placeholder script.

Existing Wrangler and Miniflare v4 configuration continues to work through the compatibility adapter, which drops the script of a Worker whose `assets.routerConfig.has_user_worker` is `false`.
