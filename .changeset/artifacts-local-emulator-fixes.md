---
"miniflare": patch
---

Fix several local Artifacts emulator issues found while testing it as a customer

- The local Git remote keeps its port across dev server restarts, so existing clones keep working, and Wrangler prints each namespace's Git remote prefix at startup. If another process holds the port, a new one is chosen and printed.
- Workers Vitest no longer logs a caught `ArtifactsError` as an uncaught exception. Local bindings now throw errors in the caller's isolate, so they never cross a workerd RPC boundary.
- A push containing a file larger than 32 MB is rejected, as in production. Reading a larger file throws `ArtifactsError` with code `MEMORY_LIMIT` instead of a raw RPC serialization error.
- `listTokens()` includes revoked and expired tokens with `state: "revoked"` or `state: "expired"`, listed after all active tokens. An expired token can no longer be revoked: `revokeToken()` returns `false` and its state stays `"expired"`.
- Results now follow the published binding types: `list()` items have no `remote`, `log()` caps `limit` at 1000 instead of rejecting it, and `readTree()` and `readCommit()` throw `INTERNAL_ERROR` for an object of another type instead of returning `null`.
