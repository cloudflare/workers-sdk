---
"@cloudflare/codemods": minor
---

Add a `skipViteSetup` option to `migrateWranglerToCf`

Callers that set up the Vite project after migrating, as `cf` does with autoconfig, can pass `skipViteSetup: true`. The migration then leaves installing an undeclared `@cloudflare/vite-plugin` and configuring static assets to the caller, so the generated `cloudflare.config.ts` has no TODOs or blocking follow-ups for them. A declared plugin is still upgraded.
