---
"wrangler": patch
---

Disable flagship OAuth scopes that are not yet valid in the Cloudflare backend

The `flagship:read` and `flagship:write` OAuth scopes have been temporarily commented out from the default scopes requested during login, as they are not yet recognized by the Cloudflare backend.
