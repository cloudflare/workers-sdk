---
"@cloudflare/platform-proxy": minor
---

Add `@cloudflare/platform-proxy`, a new home for `getPlatformProxy()` that reads `cloudflare.config.ts`

Like Wrangler's `getPlatformProxy()`, it gives code running in Node.js during local development, such as a framework's dev server, the bindings of the project's Worker, and persists their data to `.cloudflare/state` like the Cloudflare Vite plugin. Pass `url` to use the bindings of a runtime that's already running instead, such as a Cloudflare Vite plugin dev server. When it starts its own runtime, secrets, remote bindings and the `assets` binding aren't supported yet. The package is experimental, and its API may change.
