---
"wrangler": patch
---

Validate JSON stdin values for `wrangler secret bulk`

JSON input piped through stdin now validates that secret values are strings or null before sending them to the API, matching the existing behavior for file input.
