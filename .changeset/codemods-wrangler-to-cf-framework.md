---
"@cloudflare/codemods": minor
---

Set up the framework when migrating a Wrangler project with `wrangler-to-cf`

The `wrangler-to-cf` codemod now also sets up the project's framework for cf, and chooses the bundler from the project instead of always using Vite. The `migrateWranglerToCf` export is removed, and `convertWranglerConfig` moves from `@cloudflare/codemods/wrangler-to-cf` to `@cloudflare/autoconfig/wrangler-to-cf`.
