---
"@cloudflare/containers-shared": patch
"wrangler": patch
---

Wait for a just-uploaded Worker version to become readable during deploys

For a few seconds after a version is uploaded, the Workers API can alternate between returning it and reporting it as not found. `wrangler versions deploy` failed on the first not-found read, and `wrangler deploy` for Durable Object-managed containers gave up after about 2 seconds and reported that the container settings were not fully applied.

Both now keep retrying for up to about 12 seconds and log a message while they wait. Other errors still fail immediately.
