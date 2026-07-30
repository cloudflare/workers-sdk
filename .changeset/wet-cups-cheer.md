---
"@cloudflare/workflows-shared": minor
"miniflare": patch
"wrangler": patch
---

Add cron scheduling groundwork for local Workflows

Groundwork for cron-triggered Workflows in local dev. The `schedules` config is now plumbed from `wrangler dev` through to Miniflare, and the engine can arm a Durable Object alarm that runs the Workflow with `event.schedule` (`{ cron, scheduledTime }`) populated when it fires, using the saffron cron parser vendored as a WebAssembly build. Cron-triggered Workflows don't run locally yet.
