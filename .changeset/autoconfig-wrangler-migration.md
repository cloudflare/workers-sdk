---
"@cloudflare/autoconfig": minor
---

Migrate a project's Wrangler config when setting it up for cf

Setting up a project for cf now converts its Wrangler config to `cloudflare.config.ts`, keeping its bindings and other settings, instead of ignoring it. With `installDependencies: false`, the migration lists the packages it needs instead of installing them.
