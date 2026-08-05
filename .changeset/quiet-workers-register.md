---
"miniflare": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

Add per-worker control over dev registry registration

Miniflare workers can now opt in to the dev registry with `unsafeRegisterWorker`. Wrangler and the Cloudflare Vite plugin use this option to advertise user workers without exposing internal or external workers.
