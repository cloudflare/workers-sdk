---
"@cloudflare/codemods": patch
---

Generate development types by default in Wrangler migrations

Generated `wrangler.config.ts` now enables type generation when the source omits `dev.generate_types`. An explicit `false` remains disabled.
