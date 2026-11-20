---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Accept the same `retention` durations in local Workflow `createBatch()` calls as production does

In local development, the object and `count` forms of `createBatch()` now accept any `retention` duration that `create()` and production accept: any finite number of milliseconds, and any string that parses to one, including zero and negative durations such as `0` and `"-1 day"`. Previously, they rejected durations that were not positive.

They also check every entry's options before any instance ID, as production does. So a batch with both an invalid ID and an invalid option now rejects with the `(body)` error for the option.
