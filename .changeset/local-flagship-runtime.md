---
"miniflare": minor
---

Simulate Flagship bindings locally

Flagship bindings can now evaluate flags against a persisted local store instead of requiring a remote app. Miniflare also exposes an admin API for populating and managing that store in development tools and tests, while bindings configured for remote access continue to proxy to Flagship.
