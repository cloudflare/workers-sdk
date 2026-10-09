---
"@cloudflare/vitest-plugin": minor
---

Remove the dependency on `wrangler`

The Vitest plugin no longer depends on `wrangler`. Reading the Wrangler configuration file, generating Miniflare options, loading local variables, splitting D1 migration SQL and serving the Pages `ASSETS` binding now use shared workers-sdk packages that are bundled into the plugin. Installing the plugin no longer installs `wrangler` as well. If your project runs the `wrangler` CLI (for example `wrangler types`), add `wrangler` to your own `devDependencies`.
