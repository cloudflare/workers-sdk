---
"@cloudflare/autoconfig": patch
---

Keep existing project files when setting up a project

React Router setup no longer fails when the project already has a `workers` folder, and keeps an existing `workers/app.ts`. Setup for cf also keeps an existing `cloudflare.config.ts`.
