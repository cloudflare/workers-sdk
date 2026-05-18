---
"wrangler": patch
---

fix: Allow `streams create --schema-file` to accept full `streams get --json` output

Previously, piping `wrangler pipelines streams get <id> --json` output into `--schema-file` for `streams create` would fail because the full stream JSON nests the schema under a `schema` key, while `--schema-file` only accepted `{ "fields": [...] }` at the top level.

Now `--schema-file` accepts both formats: a direct schema object (`{ "fields": [...] }`) and the full stream JSON output from `streams get --json`. Additionally, a new `--export-schema` flag on `streams get` outputs only the schema portion, directly compatible with `--schema-file`:

```
wrangler pipelines streams get <id> --export-schema > schema.json
wrangler pipelines streams create new_stream --schema-file schema.json
```
