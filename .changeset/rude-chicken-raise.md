---
"miniflare": patch
---

fix: ensure `Mutex` doesn't report itself as drained if locked

Previously, Miniflare's `Mutex` implementation would report itself as drained
if there were no waiters, regardless of the locked state. This bug meant that
if you called but didn't `await` `Miniflare#setOptions()`, future calls to
`Miniflare#dispatchFetch()` (or any other asynchronous `Miniflare` method)
wouldn't wait for the options update to apply and the runtime to restart before
sending requests. This change ensures we wait until the mutex is unlocked before
reporting it as drained.
