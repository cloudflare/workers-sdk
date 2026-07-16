---
"miniflare": minor
---

Add a `handleUncaughtError` shared option that receives uncaught Worker exceptions

The runtime catches handler exceptions to build the 500 response, so they never reach the inspector — the one place an uncaught exception exists as a structured value in Node is the pretty-error path, where the error report from the Worker is revived into a source-mapped `Error`. Embedders can now pass `handleUncaughtError: (error: Error) => void` to observe that revived error programmatically; logging behavior is unchanged.

The hook fires only where the pretty-error path does: requests reaching the Worker through the entry socket (a browser or another HTTP client against the dev server). `dispatchFetch()` is unaffected — it always sets `MF-Disable-Pretty-Error`, and the entry worker then propagates the exception by rejecting the returned promise instead, so `dispatchFetch()` callers already receive the error directly and the hook is not invoked.
