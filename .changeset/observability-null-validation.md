---
"@cloudflare/workers-utils": patch
---

Return a clear error when `observability` is set to `null`

`validateObservability` guarded only against `undefined`, so a `null` value (valid in JSON/JSONC config) passed the `typeof value === "object"` check and then threw `TypeError: Cannot read properties of null (reading 'enabled')` while validating the config. It now rejects `null` with the same `"observability" should be an object but got null.` diagnostic that the sibling `cache` validator already produces.
