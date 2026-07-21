---
"wrangler": minor
---

Remove `containerEngine` from the worker options returned by `unstable_getMiniflareWorkerOptions`

`unstable_getMiniflareWorkerOptions` no longer includes `containerEngine` in the returned `workerOptions`, since the container engine is a Miniflare instance-wide setting rather than a per-worker one. Callers that build a Miniflare instance from these options should set `containerEngine` at the top level instead.
