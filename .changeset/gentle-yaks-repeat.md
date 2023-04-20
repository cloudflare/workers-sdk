---
"wrangler": patch
---

Fix: fix local registry server closed

Closes [#1920](https://github.com/cloudflare/workers-sdk/issues/1920). Sometimes start the local dev server will kill
the devRegistry server so that the devRegistry server can't be used. We can listen the devRegistry server close event
and reset server to `null`. When registerWorker is called, we can check if the server is `null` and start a new server.
