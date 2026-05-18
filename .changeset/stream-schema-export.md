---
"wrangler": patch
---

Allow `streams create --schema-file` to accept full `streams get --json` output

Previously, piping `wrangler pipelines streams get <id> --json` output into `--schema-file` for `streams create` would fail because the full stream JSON nests the schema under a `schema` key, while `--schema-file` only accepted `{ "fields": [...] }` at the top level.

Now `--schema-file` accepts both formats: a direct schema object (`{ "fields": [...] }`) and the full stream JSON output from `streams get --json`.
