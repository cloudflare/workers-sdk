---
"wrangler": patch
---

fix: patch undici to prevent fetch() throwing on 401 responses with a request body

Fetching with a request body (string, JSON, FormData, etc.) to an endpoint that returns a 401 would throw `TypeError: fetch failed` with cause `expected non-null body source`. This affected `Unstable_DevWorker.fetch()` and any other use of undici's fetch in wrangler.

The root cause is `isTraversableNavigable()` in undici returning `true` unconditionally, causing the 401 credential-retry logic to run in Node.js where it should never apply (there is no browser UI to prompt for credentials). This is tracked upstream in [nodejs/undici#4910](https://github.com/nodejs/undici/issues/4910). Until an upstream fix is released, we apply a patch to undici that returns `false` from `isTraversableNavigable()`.
