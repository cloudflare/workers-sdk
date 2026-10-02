---
"@cloudflare/codemods": patch
---

Use the default type generation behavior in projects migrated by `cf migrate`.

Wrangler projects without `dev.generate_types: false` no longer get a `wrangler.config.ts` solely for a redundant type setting. An explicit opt-out still emits `types.generate: false`, and other Wrangler tooling still produces a config when needed.
