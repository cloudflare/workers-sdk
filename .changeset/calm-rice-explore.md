---
"miniflare": minor
---

Allow Local Explorer R2 APIs to access arbitrary local bucket IDs

R2 object operations now address Miniflare's internal bucket service directly, so they no longer require a configured R2 binding. Shared-storage sessions route these requests to the elected storage owner, and bucket listings only aggregate peers in the same shared-storage scope.
