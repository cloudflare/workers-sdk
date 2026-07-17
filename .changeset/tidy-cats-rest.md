---
"miniflare": patch
---

Prevent concurrent Miniflare instances from deleting each other's temporary email sessions

Email session cleanup now removes only the current instance's session directory and leaves the shared parent intact, avoiding startup failures when multiple local runtimes use the same project.
