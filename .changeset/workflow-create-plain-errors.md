---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Reject local Workflow `create()` calls with a plain `Error`, as production does

The error message now starts with its code, such as `(instance.already_exists)` or `(instance.invalid_id)`, as it does in production. Previously the local binding threw a `WorkflowError`. Unless the Worker listed the `enhanced_error_serialization` compatibility flag explicitly, that arrived as an `Error` whose message began with `WorkflowError: `, even on a compatibility date that enables the flag by default. With the flag listed, its `name` was `WorkflowError`.
