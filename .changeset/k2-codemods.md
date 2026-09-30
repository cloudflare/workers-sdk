---
"@cloudflare/codemods": minor
---

Migrate beta K2 producer bindings in the `wrangler-to-cf` codemod

`k2` entries in a Wrangler configuration file are converted to `bindings.k2({ stream })`. A `remote` setting is carried over as `dev.remote`.
