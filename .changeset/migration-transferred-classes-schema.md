---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Add the missing `transferred_classes` migration to the config schema

`DurableObjectMigration` described `new_classes`, `new_sqlite_classes`,
`renamed_classes` and `deleted_classes`, but not `transferred_classes`.
`normalizeAndValidateConfig` has always validated that key, and the deploy path
forwards it to the API along with the rest of the step, so Transfer migrations
worked — but `config-schema.json` is generated from the type, so an editor
resolving `$schema` reported a valid, documented migration as an unknown key.

Adding the field to the type puts it in the generated schema. No runtime change.
