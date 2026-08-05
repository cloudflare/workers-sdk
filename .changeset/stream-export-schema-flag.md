---
"wrangler": minor
---

Add `--export-schema` flag to `pipelines streams get` command

A new `--export-schema` flag on `wrangler pipelines streams get` outputs only the stream schema in a format directly compatible with `--schema-file` on `streams create`. This makes it easy to clone a stream's schema:

```
wrangler pipelines streams get <id> --export-schema > schema.json
wrangler pipelines streams create new_stream --schema-file schema.json
```

For unstructured streams (no schema), a message is shown instead of empty output.
