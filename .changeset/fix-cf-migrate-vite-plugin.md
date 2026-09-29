---
"@cloudflare/codemods": patch
---

Upgrade the Vite plugin when migrating a Wrangler project to cf with Vite

Vite migrations now install a compatible `@cloudflare/vite-plugin` version and update the project's lockfile when the existing version is unsupported. Compatible installations remain unchanged, and Wrangler migrations do not update the plugin.
