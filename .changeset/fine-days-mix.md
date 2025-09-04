---
"@cloudflare/vite-plugin": patch
---

Ensure that preview config values are used for remote bindings

Ensure that if in some remote binding configuration provides a preview value (e.g. `preview_database_id` for D1 bindings) such value gets used instead of the standard ones
