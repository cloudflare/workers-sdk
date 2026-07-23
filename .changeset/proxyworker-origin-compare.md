---
"wrangler": patch
---

Fix dev proxy silently hanging or returning a misleading 503 on network errors for non-root-path requests

During `wrangler dev`, a transient network error on any request path other than `/` could be misclassified as the worker being reloaded, even when it wasn't: `GET`/`HEAD` requests would silently hang (with nothing logged) until the client timed out, and other methods would receive a misleading `Your worker restarted mid-request` 503. Such errors are now reported and surfaced immediately when the worker has not actually changed.
