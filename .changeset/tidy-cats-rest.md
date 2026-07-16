---
"miniflare": patch
---

Prevent concurrent Miniflare instances from deleting each other's temporary email sessions

Email session cleanup now atomically removes the shared parent directory only when it is empty, avoiding startup failures when multiple local runtimes use the same project.
