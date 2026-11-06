---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Reject settings on a `workflows` binding to a Workflow declared in `exports`

A `workflows` binding can still bind a Workflow that the Worker declares in `exports`, but it can no longer set `limits`, `concurrency`, `schedules`, `default_retention`, or `jurisdiction` for it. Set them on the export instead. Previously the binding and the export could both set them as long as they agreed, so configurations that set them on the binding now stop with an error that says which setting to move.
