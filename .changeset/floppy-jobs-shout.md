---
"miniflare": patch
---

Fix intermittent "Fetch failed" errors in Miniflare tests on Windows

Miniflare tests would occasionally fail with "Fetch failed" errors (particularly on Windows CI runners) due to race conditions between undici's Keep-Alive mechanism and the Miniflare server closing idle connections. Miniflare now configures the Dispatcher to prevent connection reuse and eliminate these race condition errors.
