---
"@cloudflare/config": minor
"miniflare": minor
---

Rename Worker target fields from `workerName` to `worker`

The experimental `@cloudflare/config` and Miniflare configuration APIs now use `worker` consistently for Worker, Durable Object, Workflow, dispatch namespace, and tail consumer targets.
