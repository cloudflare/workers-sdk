---
"miniflare": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Enable Miniflare's development registry by default and centralize path resolution

In Miniflare v5 beta, resolve the registry from `CLOUDFLARE_DEV_REGISTRY_PATH`, then the `unsafeDevRegistryPath` constructor option, then `<Cloudflare config directory>/dev-registry/v5`. The default is independent of legacy Wrangler directories and is scoped to the Miniflare major version. The Vite v2 beta plugin follows this new default, while current Wrangler and `getPlatformProxy()` retain Wrangler's legacy default for compatibility with existing Wrangler sessions. Vite v2 and Wrangler therefore require the same `CLOUDFLARE_DEV_REGISTRY_PATH` to discover each other; set it for both processes when mixing these tools.

Add `enableDevRegistry: false` to disable registration and discovery explicitly. Shared storage now uses the resolved default without requiring an explicit path. As before, shared storage requires an enabled registry to elect a storage owner, so combining `unsafeEnableSharedStorage: true` with `enableDevRegistry: false` is rejected. Miniflare no longer reads `MINIFLARE_REGISTRY_PATH`; use `CLOUDFLARE_DEV_REGISTRY_PATH` instead. Expose `resolveDevRegistryPath()` for integrations that also read registry files. Wrangler uses the effective path for its runtime configuration, initial bindings display, and Flagship active-session check, so the canonical override cannot bypass that check. An explicitly disabled Wrangler registry remains disabled.
