---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Check the deprecated array form of local Workflow `createBatch()` calls as production does

In local development, `createBatch([...])` now checks its entries the way the object form does, as production does:

- an empty array, or more than 100 entries, rejects with `(body) Batch size exceeds maximum allowed`;
- each entry's options are validated, so a non-string `id`, an unparseable `retention` duration, an unknown `locationHint` or a `null` entry rejects with `(body)` followed by each problem;
- invalid IDs, and the reserved IDs `batch`, `terminate`, `terminateAll` and `cf_` followed by 64 lowercase hexadecimal characters, reject with `(instance.invalid_id) Instance ID is invalid`;
- every rejection is a plain `Error`;
- an entry whose params Durable Object storage cannot clone is left out of the returned instances, like an entry with an existing or repeated ID.

Previously, the array form rejected with `WorkflowError` messages such as `batchCreate should have at least 1 instance` and `Workflow instance has invalid id`. It also accepted reserved IDs and unvalidated options, threw a `TypeError` for a `null` entry, and created entries whose params could not be stored, which then stayed queued forever.
