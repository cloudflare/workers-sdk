---
"@cloudflare/codemods": minor
---

Add a programmatic Wrangler-to-cf configuration migration

The new `migrateWranglerToCf()` API writes `cloudflare.config.ts`, preserves supported environments and bindings, and reports manual follow-up work without reading secret files. Wrangler-specific tooling can optionally be written to `wrangler.config.ts` for projects that retain Wrangler's bundler.
