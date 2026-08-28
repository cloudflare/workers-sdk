---
"miniflare": minor
---

Allow Local Explorer KV APIs to access arbitrary local namespace IDs

KV operations now address Miniflare's internal namespace service directly, so they no longer require a configured KV binding. Shared-storage sessions route these requests to the elected storage owner, and namespace listings only aggregate peers in the same shared-storage scope.
