---
"@cloudflare/codemods": minor
---

Migrate through autoconfig's setup in the `wrangler-to-cf` codemod

The `wrangler-to-cf` codemod now runs the same setup as cf, which also points the `deploy` script at `cf deploy`, and chooses the bundler from the project instead of always using Vite. The `migrateWranglerToCf` export is removed, and `convertWranglerConfig` moves from `@cloudflare/codemods/wrangler-to-cf` to `@cloudflare/autoconfig/wrangler-to-cf`.
