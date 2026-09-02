---
"miniflare": minor
---

Allow Local Explorer storage APIs to access arbitrary local resource IDs

D1, KV and R2 operations now address Miniflare's internal storage services directly, so they no longer require configured bindings. Shared-storage sessions route these requests to the elected storage owner, and storage listings only aggregate peers in the same shared-storage scope.
