---
"wrangler": patch
---

Previously, when running `wrangler dev`, requests inflight during a UserWorker reload (due to config or source file changes) would fail. Now, if those inflight requests are GET or HEAD requests, they will be reproxied against the new UserWorker. This adds to the guarantee that requests made during local development reach the latest worker.
