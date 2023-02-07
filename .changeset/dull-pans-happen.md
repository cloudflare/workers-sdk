---
"wrangler": patch
---

Fixes large Pages projects failing to complete direct upload due to expiring JWTs

For projects which are slow to upload - either because of client bandwidth or large numbers of files and sizes - It's possible for the JWT to expire multiple times. Since our network request concurrency is set to 3, it's possible that each time the JWT expires we get 3 failed attempts. This can quickly exhaust our upload attempt count and cause the entire process to bail.

This change makes it such that jwt refreshes do not count as a failed upload attempt.
