---
"wrangler": patch
---

Correctly classify dev proxy fetch errors by comparing UserWorker origins instead of hrefs

The ProxyWorker's stale-error guard compared a path-bearing URL against an origin-only URL, so it could only match for requests to `/`. Genuine network errors on any other path were misclassified as "UserWorker changed": failed GET/HEAD requests were silently parked in the retry queue (the client hangs), and non-GET requests received a misleading "Your worker restarted mid-request" 503. Errors for an unchanged UserWorker are now reported and rejected immediately.
