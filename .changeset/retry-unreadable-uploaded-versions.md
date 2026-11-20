---
"@cloudflare/workers-utils": patch
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Wait longer for a just-uploaded Worker version to become readable during deploys

For a few seconds after a version is uploaded, the Workers API can alternate between returning it and reporting it as not found (code 100146). `wrangler versions deploy` failed on the first not-found read, and `wrangler deploy` for Durable Object-managed containers gave up after about 2 seconds and reported that the container settings were not fully applied.

Both now retry these reads with backoff for about 12 seconds, through `retryOnAPIFailure`, which also retries transient API failures such as 5xx responses. Other errors still fail immediately.
