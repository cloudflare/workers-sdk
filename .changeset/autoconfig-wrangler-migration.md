---
"@cloudflare/autoconfig": minor
---

Migrate a project's Wrangler config when setting it up for cf

Setting up a project for cf now converts its Wrangler config to `cloudflare.config.ts`, keeping its bindings and other settings, and sets up the project's framework in the same step when autoconfig can set it up for cf.
