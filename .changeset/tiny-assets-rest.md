---
"miniflare": patch
---

Reduce the size of Miniflare's embedded asset and router Workers

Miniflare does not configure Sentry credentials for its asset services, so their builds now replace the unused production Sentry setup with a no-op instead of bundling Toucan.
