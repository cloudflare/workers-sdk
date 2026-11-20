---
"miniflare": minor
---

Show precise span timings in local observability

With local observability on, the Local Explorer now shows each span's real start time and duration. Previously, spans were rebuilt from streaming tail events, which only report coarse I/O times. workerd now exports the spans directly to Miniflare's collector. Logs and exceptions are captured as before.

While local observability is on, which it is by default, a streaming tail worker configured locally no longer receives `spanOpen` and `spanClose` events. Spans on streaming tail workers are being deprecated, both in local development and in production.
