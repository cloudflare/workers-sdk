---
"wrangler": minor
---

Improve `wrangler tail` resilience and shutdown behaviour

`wrangler tail` previously crashed with a raw stack trace when the keep-alive ping to the Worker timed out, and could exit with an ugly error on Ctrl-C.

- Errors now flow through wrangler's usual error pipeline instead of escaping as uncaught exceptions.
- The keep-alive timeout message now clearly explains what happened and no longer prints a stack trace.
- When the tail connection drops unexpectedly, `wrangler tail` now automatically tries to reconnect with exponential back-off (up to 5 retries).
- Ctrl-C now prints a short "Stopping tail..." message (in pretty mode), awaits the server-side tail deletion, and exits cleanly with code 0.
