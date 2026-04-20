---
"miniflare": patch
---

Rename `Flags` type to `Flagship` to match the upstream rename in `@cloudflare/workers-types`

The `Flags` type was renamed to `Flagship` in `@cloudflare/workers-types`. This updates the import and the return type of `getFlagshipBinding` accordingly.
