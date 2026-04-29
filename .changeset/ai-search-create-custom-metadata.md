---
"wrangler": minor
---

Add optional `custom_metadata` step to `wrangler ai-search create`

The `wrangler ai-search create` interactive wizard now lets you declare custom metadata fields that the new AI Search instance should index. Each field is a `field_name` paired with a `data_type` (`text`, `number`, `boolean`, or `datetime`).

You can provide fields up-front via the new repeatable `--custom-metadata` flag using `field_name:data_type` syntax:

```sh
wrangler ai-search create my-instance \
  --type r2 --source my-bucket \
  --custom-metadata title:text \
  --custom-metadata views:number
```

For larger schemas, use `--custom-metadata-schema` to point at a JSON file. The file may contain either a bare array of `{ field_name, data_type }` objects or an object of the form `{ "custom_metadata": [...] }`, so you can paste examples from the API docs directly:

```sh
wrangler ai-search create my-instance \
  --type r2 --source my-bucket \
  --custom-metadata-schema schema.json
```

```jsonc
// schema.json
{
	"custom_metadata": [
		{ "field_name": "title", "data_type": "text" },
		{ "field_name": "views", "data_type": "number" },
	],
}
```

Otherwise, when running interactively without either flag, the wizard now asks "Configure custom metadata fields? (optional)" and walks you through each field. The CLI validates field names client-side (non-empty, unique, and not a reserved name like `timestamp`/`folder`/`filename`) and caps the list at 20 entries to match the AI Search backend.

The wizard skips this step in non-interactive/CI contexts and when `--json` is used, so the field stays fully optional.
