---
"miniflare": patch
---

Reject readiness when the workerd process cannot be spawned

Miniflare now reports `WORKERD_SPAWN_FAILED` with the original cause when the runtime executable is missing or cannot be executed. It closes the failed child's stdio and waits for closure so startup failure does not leave readiness or disposal hanging.
