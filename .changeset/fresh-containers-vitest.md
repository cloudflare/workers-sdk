---
"@cloudflare/vitest-plugin": minor
---

Run the Containers that the Wrangler configuration attaches to Durable Objects

Previously, the plugin disabled Containers, so those Durable Objects ran without `ctx.container`. The plugin now builds or pulls the Containers' images before each project's tests run and gives the Durable Objects a real `ctx.container`, so these projects now need Docker. To keep running their tests without Docker, set `dev.enable_containers` to `false` in the Wrangler configuration, which disables the Containers. Cloudflare-managed registry images are not supported yet.
