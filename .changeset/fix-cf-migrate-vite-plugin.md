---
"@cloudflare/cli-shared-helpers": patch
"@cloudflare/codemods": patch
---

Upgrade the Vite plugin when migrating a Wrangler project to cf with Vite

Vite migrations now install `@cloudflare/vite-plugin@beta`, keep the `beta` dist tag in `package.json`, and update the project's lockfile when the existing version is unsupported. Compatible installations remain unchanged, and Wrangler migrations do not update the plugin.
