---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Validate local Workflow `create()` options and instance IDs as production does

In local development, `create()` now rejects the inputs that production rejects, with the same error codes. Invalid options, such as a non-string `id`, an unparseable `retention` duration, or an unknown `locationHint`, reject with `(body)` followed by each problem. IDs that are too long, use unsupported characters, or are reserved (`batch`, `terminate`, `terminateAll`, or `cf_` followed by 64 lowercase hexadecimal characters) reject with `(instance.invalid_id) Instance has invalid id`, which replaces `Workflow instance has invalid id`.

Previously, local development accepted reserved IDs and did not check `retention` or `locationHint`, and a `null` argument threw a `TypeError` instead of creating an instance with a generated ID. The deprecated array form of `createBatch()` keeps its existing checks.
