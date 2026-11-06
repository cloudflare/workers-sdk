---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Require a Workflow to be declared either in `workflows` or in `exports`, not both

Previously, a Workflow owned by the Worker could be declared both in the top-level `workflows` config and as a `workflow` export, as long as the two declarations agreed. `wrangler deploy`, `wrangler versions upload`, and `wrangler triggers deploy` now stop with an error when an owned `workflows` entry and a `workflow` export share a name. Keep the `workflows` entry, or remove it, keep the `exports` entry, and use `ctx.exports.<ClassName>` in your code instead of the binding.
