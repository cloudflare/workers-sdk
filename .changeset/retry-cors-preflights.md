---
"wrangler": patch
---

Retry bodyless CORS preflights after transient local connection loss

`wrangler dev` now retries a bodyless `OPTIONS` request when its internal connection to the UserWorker drops before a response is received, matching the existing handling for `GET` and `HEAD`. Requests that may carry application side effects are still not replayed automatically.
