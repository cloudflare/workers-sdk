---
"miniflare": patch
---

Fix KV bulk `getWithMetadata` dropping metadata for present-but-falsy values

The bulk-get handler decided whether to wrap an entry as `{ value, metadata }` based on the truthiness of the value rather than on whether the key existed. Keys holding a falsy value — an empty string, or `0`, `false` and `null` when reading with `type: "json"` — were returned as bare values, losing their metadata and diverging from the shape the runtime binding expects for present keys. Empty-string values were the most common trigger.

The check now gates on entry presence, so present keys always keep their `{ value, metadata }` wrapper and only missing keys return a bare `null`.
