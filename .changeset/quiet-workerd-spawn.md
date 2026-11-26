---
"miniflare": patch
---

Reject readiness when the workerd process cannot be spawned

Miniflare now reports `ERR_RUNTIME_SPAWN_FAILED` with the original cause when the runtime executable is missing or cannot be executed. Readiness rejects promptly, and disposal completes without hanging.
