---
"wrangler": patch
---

fix: stop checking for open port once it has timed out in `waitForPortToBeAvailable()`

Previously, if `waitForPortToBeAvailable()` timed out, the `checkPort()`
function would continue to be called.
Now we clean up fully once the promise is resolved or rejected.
