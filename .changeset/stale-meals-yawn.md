---
"create-cloudflare": patch
---

fix: ensure the Angular fetch handler returns a "real" promise to Cloudflare

Angular employs the Zone.js library to patch potentially async operations so that
it can trigger change detection reliably. But in order to do this, it swaps out
the native `Promise` with a `ZoneAwarePromise` class.

The Cloudflare runtime (i.e. workerd) does runtime checks on the value returned
from the `fetch()` handler, expecting it to be a native `Promise` and fails if not.

This fix ensures that the actual object returned from the `fetch()` is actually a
native `Promise`. We don't need to stop Angular using `ZoneAwarePromises` elsewhere.
