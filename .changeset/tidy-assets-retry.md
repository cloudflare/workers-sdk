---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Retry transient failures when starting a Workers assets upload session

Asset manifest registration now uses the same bounded API retry policy as Worker uploads, including support for `Retry-After`. Temporary server errors no longer immediately abort an otherwise valid deployment. Persistent failures still surface the original error after the retry limit; this does not repair server-side issues affecting a specific Worker.
