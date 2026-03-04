---
"@cloudflare/format-errors": patch
---

Await async `handlePrettyErrorRequest` in the fetch handler's try/catch

Previously, the `handlePrettyErrorRequest()` call was not awaited in the catch block. Since it is an async function, any rejection (e.g. from Youch rendering) would result in an unhandled promise rejection instead of being caught — meaning the error counter wouldn't increment, Sentry wouldn't capture the exception, and the user would not receive the 500 JSON fallback response. This is now fixed.
