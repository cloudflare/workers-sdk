---
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Remove the dependency on `wrangler`

The Vite plugin and the Vitest plugin no longer depend on `wrangler`. Configuration reading, Miniflare option generation, local variable loading, D1 SQL splitting and the Pages `ASSETS` binding now come from shared workers-sdk packages that are bundled into each plugin. `wrangler` is no longer a peer dependency of `@cloudflare/vite-plugin`, so projects that only use the plugins don't need to install it, and the plugins no longer need to be kept in step with a particular `wrangler` version.
