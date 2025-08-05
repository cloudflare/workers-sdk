---
"miniflare": minor
---

Added a `serviceName` option to `unsafeDirectSockets`

This allows registering the current worker in the dev registry under its own name, but routing to a different service.
