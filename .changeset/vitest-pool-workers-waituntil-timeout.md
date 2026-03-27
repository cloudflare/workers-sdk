---
"@cloudflare/vitest-pool-workers": patch
---

Add a 30-second timeout to `waitUntil` promise draining to prevent hanging tests

Previously, if a `ctx.waitUntil()` promise never resolved, the test suite would hang indefinitely after the test file finished. Now, any `waitUntil` promises that haven't settled within 30 seconds are abandoned with a warning, allowing the test suite to continue. This aligns with the [production `waitUntil` limit](https://developers.cloudflare.com/workers/platform/limits/#duration).
