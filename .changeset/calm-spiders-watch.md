---
"miniflare": patch
---

Prevent short-lived Miniflare instances from hanging during disposal

Wait for the development registry's filesystem watcher to finish initialising before runtime startup completes, ensuring the watcher can always be closed cleanly.
