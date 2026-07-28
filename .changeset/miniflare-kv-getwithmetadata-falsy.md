---
"miniflare": patch
---

Fix `getWithMetadata` dropping metadata for falsy KV values

`KVNamespace.getWithMetadata` returned `null` metadata whenever the stored value was falsy — an empty string or `"0"` — because the metadata branch was guarded by a truthiness check on the value. The guard now checks for `null` explicitly, so metadata is preserved for empty-string and `"0"` values while genuinely missing keys still return `null`.
