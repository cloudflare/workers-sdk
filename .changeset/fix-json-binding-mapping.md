---
"@cloudflare/workers-utils": patch
---

Correctly map JSON bindings in `mapWorkerMetadataBindings`

The `json` binding case used literal keys `name` and `json` instead of a computed property key `[binding.name]: binding.json`. This caused JSON bindings to always produce `{ name: "<binding_name>", json: <value> }` instead of `{ <binding_name>: <value> }`, clobbering any existing vars with those keys. This is now consistent with how `plain_text` bindings are mapped.
