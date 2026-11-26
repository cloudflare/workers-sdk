---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Make local Workflow `create()` and `createBatch()` errors match production

In local development, `create()` and `createBatch()` now reject the inputs that production rejects, with the same error codes. They reject with a plain `Error` whose message starts with the code, such as `(body)` or `(instance.invalid_id)`. Previously they threw a `WorkflowError`, which arrived as an `Error` whose message began with `WorkflowError: ` unless the Worker listed the `enhanced_error_serialization` compatibility flag explicitly.

- Invalid options, such as a non-string `id`, an unparseable `retention` duration or an unknown `locationHint`, reject with `(body)` followed by each problem. `createBatch()` checks every entry's options before any ID, and accepts zero and negative `retention` durations, as `create()` and production do.
- IDs that are too long, use unsupported characters, or are reserved (`batch`, `terminate`, `terminateAll`, or `cf_` followed by 64 lowercase hexadecimal characters) reject with `(instance.invalid_id)`.
- Params that Durable Object storage cannot clone, such as functions, RPC targets and streams, no longer create an instance that stays queued forever. `create()` rejects with `(body) Provided instance parameters are not serializable`. `createBatch()` reports the entry in `errors` with code `10002` and the ID the instance would have had. An entry whose ID already exists or repeats in the batch is still reported with `10405` or `10415`.
- `create(null)` creates an instance with a generated ID instead of throwing a `TypeError`, and `create({ params: null })` gives the Workflow `{}` as its payload.
- The deprecated array form of `createBatch()` gets the same checks as the object form. It leaves out entries whose params cannot be stored, as it does entries with an existing or repeated ID.
