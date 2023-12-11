---
"wrangler": minor
---

feat: When Wrangler crashes, send an error report to Sentry to aid in debugging.

When Wrangler's top-level exception handler catches an error thrown from Wrangler's application, it will offer to report the error to Sentry. This requires opt-in from the user every time.
