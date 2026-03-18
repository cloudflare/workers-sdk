---
"wrangler": patch
---

fix: Add retry and timeout protection to remote preview API calls

Remote preview sessions (`wrangler dev --remote`) now automatically retry transient 5xx API errors (up to 3 attempts with linear backoff) and enforce a 30-second per-request timeout. Previously, a single hung or failed API response during session creation or worker upload could block the dev session reload indefinitely.
