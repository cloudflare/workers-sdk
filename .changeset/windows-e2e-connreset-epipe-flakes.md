---
"miniflare": patch
"wrangler": patch
---

Fix Windows CI flakes in test infrastructure:

- retry local-explorer fetch on intermittent ECONNRESET
- ignore EPIPE alongside ECONNRESET in hyperdrive e2e teardown race
