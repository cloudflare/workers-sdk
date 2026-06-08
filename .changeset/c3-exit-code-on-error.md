---
"create-cloudflare": patch
---

Fix `create cloudflare` exiting with code `0` even after an unhandled error

The top-level error handler in `create cloudflare` was logging unhandled errors to stderr but the `.finally()` block always called `process.exit()` without an explicit code, which Node treats as `0` when `process.exitCode` is unset. The CLI now sets `process.exitCode = 1` in the catch path before the finally runs, so callers (CI, shell scripts) can reliably detect a failed scaffold. `CancelError` (user-initiated cancellation such as Ctrl-C or declining a prompt) still exits with `0`.
