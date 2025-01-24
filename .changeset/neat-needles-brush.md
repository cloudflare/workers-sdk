---
"wrangler": patch
---

Fix regression in retryOnAPIFailure preventing any requests from being retried

Also fixes a regression in pipelines that prevented 401 errors from being retried when waiting for an API token to become active.
