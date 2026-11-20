---
"@cloudflare/codemods": minor
---

Export the Wrangler config converter from `@cloudflare/codemods/wrangler-to-cf`

Tools that already hold a parsed Wrangler configuration can now convert it to the cf configuration in memory with `convertWranglerConfig`, instead of writing a `wrangler.json` and running `migrateWranglerToCf` on it. The new entry point loads only the converter, not the codemod runner.
