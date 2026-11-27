---
"@cloudflare/workers-utils": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Accept `fedramp-high` in `CLOUDFLARE_COMPLIANCE_REGION`

`cloudflare.config.ts` writes the FedRAMP High region as `fedramp-high`, but `CLOUDFLARE_COMPLIANCE_REGION` only accepted `fedramp_high` and rejected the other spelling with `Expected "fedramp-high" to be one of ["public","fedramp_high"]`. Both spellings are now accepted and mean the same region, so a value copied from `cloudflare.config.ts` into `CLOUDFLARE_COMPLIANCE_REGION` works.
