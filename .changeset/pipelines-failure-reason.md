---
"wrangler": minor
---

Surface pipeline status and failure reasons in `wrangler pipelines list` and `wrangler pipelines get`

`wrangler pipelines list` now includes a `Status` column, and when any pipelines are in a `failed` state it prints a summary of each failing pipeline along with the reason reported by the API.

`wrangler pipelines get` now shows the pipeline `Status` in the general details and, for failed pipelines, highlights the failure with the reason returned by the server so it is clear why a pipeline is not running.
