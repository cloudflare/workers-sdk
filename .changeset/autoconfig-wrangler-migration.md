---
"@cloudflare/autoconfig": minor
---

Migrate a project's Wrangler config when setting it up for cf

Setting up a project for cf now converts its Wrangler config to `cloudflare.config.ts`, keeping its bindings and other settings, and sets up the project's framework in the same step when autoconfig can set it up for cf. For Astro, autoconfig now writes `cloudflare.config.ts` itself, in place of the one `astro add` creates. To convert a Wrangler config in your own code, import `convertWranglerConfig` from `@cloudflare/autoconfig/wrangler-to-cf`.
