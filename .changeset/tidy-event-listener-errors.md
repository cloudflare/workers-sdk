---
"wrangler": patch
---

Preserve service-worker middleware error propagation with spec-compliant event dispatch

Wrangler's synthetic service-worker events now propagate listener exceptions to middleware without changing the behavior of user-created `EventTarget` instances.
