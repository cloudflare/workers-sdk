---
"@cloudflare/autoconfig": minor
---

Migrate a project's Wrangler config when setting it up for cf

Setting up a project for cf now converts its Wrangler config to `cloudflare.config.ts`, keeping its bindings and other settings, instead of ignoring it. The migration is also exported as `migrateWranglerToCf()`, and the in-memory converter as `convertWranglerConfig()` from `@cloudflare/autoconfig/wrangler-to-cf`.
