---
"miniflare": minor
---

Support cross-worker workflow bindings via the dev registry

When a workflow binding has a `scriptName` that refers to a worker registered in another Miniflare instance (via `unsafeDevRegistryPath`), miniflare now reroutes the engine's `USER_WORKFLOW` binding through the dev-registry-proxy worker — the same mechanism Durable Objects already use for cross-worker `scriptName` bindings.

Previously the workflow engine was bound directly to a local service `core:user:<scriptName>`, so workerd refused to start when that script lived in a different process.

This unblocks `getPlatformProxy()` (and any other split-Miniflare setup) for users whose workflow class is defined in a separate worker — for example SvelteKit/Remix on Cloudflare, where `adapter-cloudflare`'s dev integration runs the user's worker in a sidecar.

See [#7459](https://github.com/cloudflare/workers-sdk/issues/7459).
