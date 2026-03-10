---
"wrangler": patch
---

fix: `vectorize` commands now output valid json

This fixes:

- `wrangler vectorize create`
- `wrangler vectorize info`
- `wrangler vectorize insert`
- `wrangler vectorize upsert`
- `wrangler vectorize list`
- `wrangler vectorize list-vectors`
- `wrangler vectorize list-metadata-index`

Also, `wrangler vectorize create --json` now also includes the `created_at`, `modified_on` and `description` fields.
