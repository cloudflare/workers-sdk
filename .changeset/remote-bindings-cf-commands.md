---
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Name `cf` commands and settings in remote bindings errors

When remote bindings could not authenticate, the error told you to run `wrangler whoami`, `wrangler logout` and `wrangler login`. It now names `cf auth whoami`, `cf auth logout` and `cf auth login`. When a Flagship binding without an `id` needed to run remotely, the error named Wrangler's `app_id` setting and suggested `wrangler flagship apps create`. It now names `id` and suggests `cf flagship apps create`.

For the Vitest plugin, this applies to projects that load `cloudflare.config.ts`. Projects that use a Wrangler configuration file still see the Wrangler commands.
