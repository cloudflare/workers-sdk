---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Report local Workflow `createBatch()` entries whose params cannot be stored, as production does

In the object and `count` forms of `createBatch()`, an entry whose params Durable Object storage cannot clone, such as a function, an RPC target or a stream, is no longer created. Instead it appears in `errors` with code `10002` and message `workflows.api.error.body`, with the ID the instance would have had. As in production, an existing or repeated ID is reported first, with code `10405` or `10415`. Previously these entries were created, and each instance stayed queued forever because the local engine could not store its params.
