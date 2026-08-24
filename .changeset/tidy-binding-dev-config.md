---
"@cloudflare/config": minor
"miniflare": minor
---

Consolidate development-only binding configuration under `dev`

This experimental configuration now uses `dev.remote` for remote bindings and `dev.connectionString` for Hyperdrive. Miniflare's v5 binding configuration follows the same shape, and R2's local S3 credentials now share the `dev` object.
