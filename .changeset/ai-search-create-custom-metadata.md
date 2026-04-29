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

For larger schemas, use `--custom-metadata-schema` to point at a JSON file containing an array of `{ field_name, data_type }` objects:

```sh
wrangler ai-search create my-instance \
  --type r2 --source my-bucket \
  --custom-metadata-schema schema.json
```

```json
[
	{ "field_name": "title", "data_type": "text" },
	{ "field_name": "views", "data_type": "number" }
]
```
