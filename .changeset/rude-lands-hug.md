---
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Recover local development after the Workers runtime crashes

Previously, an unexpected workerd crash left Miniflare running but unable to serve subsequent requests. Miniflare now restarts workerd after post-startup crashes, while continuing to surface startup crashes as fatal errors.

The Cloudflare Vite plugin also restarts the Vite development server after workerd recovers so its environments, hot channels, and module runners are recreated.
