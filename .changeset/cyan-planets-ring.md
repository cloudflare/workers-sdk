---
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add container support to worker previews

Worker previews now support containers through a new `previews.containers` configuration block. Container configuration doesn't inherit, so declare containers explicitly in the `previews` block to enable them for previews. This mirrors how `previews.durable_objects` works today. Wrangler generates preview container application names in the form `{worker_name}_{preview_slug}_{class_name}`, and the config validator rejects entries that set a `name` field. Wrangler skips container applications bound to Durable Object classes that another Worker implements through `script_name`, because the implementing Worker owns its own container application. A `previews.containers` entry whose `class_name` matches no Durable Object binding in `previews.durable_objects` is rejected before the preview deployment is created, so a typo fails loudly instead of producing a preview with no container.

Wrangler creates container applications on `wrangler preview` and removes them on `wrangler preview delete`. Cleanup deletes only the applications the current preview declares, so it leaves other previews and other Workers alone. A failure to delete one application is logged as a warning and doesn't block the preview deletion itself.
