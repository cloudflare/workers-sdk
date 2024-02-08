---
"wrangler": patch
---

fix: inflight requests to UserWorker which failed across reloads are now retried

Previously, when running `wrangler dev`, requests inflight during a UserWorker reload (due to config or source file changes) would fail.

Now, if those inflight requests are GET or HEAD requests, they will be reproxied against the new UserWorker. This adds to the guarantee that requests made during local development reach the latest worker.
