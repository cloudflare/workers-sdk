---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Reject local Workflow `create()` calls whose params cannot be stored, as production does

Params that Durable Object storage cannot clone, such as functions, RPC targets and streams, now reject with `(body) Provided instance parameters are not serializable`. Previously `create()` resolved, and the instance stayed queued forever because the local engine could not store its params.
