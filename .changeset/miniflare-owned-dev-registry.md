---
"miniflare": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Enable Miniflare's development registry by default and centralize path resolution

In Miniflare v5 beta, resolve the registry from `CLOUDFLARE_DEV_REGISTRY_PATH`, then the `unsafeDevRegistryPath` constructor option, then `<Cloudflare config directory>/dev-registry/v5`. The default is independent of legacy Wrangler directories and is scoped to the Miniflare major version. The Vite v2 beta plugin's default registry follows the same resolution. Wrangler retains its explicit registry path and opt-out behavior, while accepting the canonical environment variable as an override through Miniflare.

Add `enableDevRegistry: false` to disable registration and discovery explicitly. Shared storage now uses the resolved default without requiring an explicit path, and rejects disabling the registry. Miniflare no longer reads `MINIFLARE_REGISTRY_PATH`; use `CLOUDFLARE_DEV_REGISTRY_PATH` instead.
