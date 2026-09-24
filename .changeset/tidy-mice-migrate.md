---
"@cloudflare/codemods": minor
---

Add a Wrangler-to-cf configuration migration

The new `wrangler-to-cf` codemod and `migrateWranglerToCf()` API write `cloudflare.config.ts`, preserve supported environments and bindings, and report manual follow-up work without reading secret files. Wrangler-specific tooling can optionally be written to `wrangler.config.ts` for projects that retain Wrangler's bundler.
