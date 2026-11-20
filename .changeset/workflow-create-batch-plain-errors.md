---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Reject local Workflow `createBatch()` calls with a plain `Error`, as production does

Except in its deprecated array form, `createBatch()` now rejects with an `Error` whose message starts with its code, such as `(body)` or `(instance.invalid_id)`, as `create()` and production do. Previously it threw a `WorkflowError`. Unless the Worker listed the `enhanced_error_serialization` compatibility flag explicitly, that arrived as an `Error` whose message began with `WorkflowError: `. With the flag listed, its `name` was `WorkflowError`.
