---
"@cloudflare/vitest-plugin": minor
---

Run the Containers that `cloudflare.config.ts` attaches to Durable Objects

Previously, projects that load `cloudflare.config.ts` through the `config` option ran those Durable Objects without their Containers. The plugin now prepares the Containers' images and runs them, as it does for Wrangler configuration files. Dockerfile and build context paths are relative to the directory that contains `cloudflare.config.ts`.

`cloudflare.config.ts` has no setting that disables local Containers, so, as with the Vite plugin, projects with Container-backed Durable Objects need Docker to run their tests.
