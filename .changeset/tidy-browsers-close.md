---
"miniflare": patch
---

Prevent local Browser Rendering teardown from hanging when Chrome does not exit

Miniflare now bounds graceful Chrome shutdown and forcefully terminates the browser process tree when needed, preventing disposal from waiting indefinitely.
