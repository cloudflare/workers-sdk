---
"wrangler": minor
---

Improve `wrangler tail` resilience and shutdown behaviour

`wrangler tail` previously crashed with a raw stack trace when the keep-alive ping to the Worker timed out, and could exit with an ugly error on Ctrl-C because the disconnect path threw from inside the keep-alive `setInterval` after the command's promise had already resolved.

The lifecycle has been refactored so that:

- The command now blocks until a clean shutdown (Ctrl-C / SIGTERM, or a normal server close) or until it permanently loses the connection. Errors flow through wrangler's usual error pipeline instead of escaping as uncaught exceptions.
- The keep-alive timeout message now clearly explains what happened and no longer prints a stack trace.
- When the tail connection drops unexpectedly (keep-alive ping timeout or abnormal close), `wrangler tail` now automatically reconnects up to 5 times with a 1s / 2s / 4s / 8s / 16s exponential back-off (≈30s total). On success, streaming resumes. After 5 failed attempts it gives up with a clear message asking the user to re-run the command to start a new session.
- Ctrl-C now prints a short "Stopping tail..." message (in pretty mode), awaits the server-side tail deletion, and exits cleanly with code 0.

This also fixes a long-standing issue where `wrangler pages dev` registered its `SIGINT`/`SIGTERM` handlers at module scope, so they were active for _every_ wrangler command. On Ctrl-C those handlers ran first and called `process.exit()`, preventing other long-running commands (such as `wrangler tail`) from shutting down gracefully. The handlers are now scoped to the `pages dev` command itself.
