---
"wrangler": patch
---

Remove unnecessary `flagship:read` OAuth scope

The `flagship:read` scope is not needed since `flagship:write` already implies read access. This reduces the OAuth permissions requested during login to only what is required.
