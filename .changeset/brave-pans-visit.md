---
"miniflare": minor
---

Allow Local Explorer D1 APIs to access arbitrary local database IDs

D1 queries now address Miniflare's internal database service directly, so they no longer require a configured D1 binding. Shared-storage sessions route these requests to the elected storage owner, and database listings only aggregate peers in the same shared-storage scope.
