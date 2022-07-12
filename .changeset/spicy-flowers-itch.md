---
"wrangler": patch
---

fix: `wrangler pages publish` now more reliably retries an upload in case of a failure

When `wrangler pages publish` is run, we make calls to an upload endpoint which could be rate limited and therefore fail. We currently retry those calls after a linear backoff. This change makes that backoff exponential which should reduce the likelihood of subsequent calls being rate limited.
