---
"@cloudflare/vite-plugin": minor
---

Support remote Hyperdrive bindings in Vite plugin v1 development and preview

Set `remote: true` on a Hyperdrive binding in `wrangler.jsonc` to connect to its deployed configuration without a local database connection string. The retained remote proxy exposes the binding's connection string and socket streams, and remote session cleanup preserves startup errors and shares one disposal attempt.
