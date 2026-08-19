---
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Add container support to worker previews

Worker previews now support containers through a new `previews.containers` configuration block. Container configuration doesn't inherit, so declare containers explicitly in the `previews` block to enable them for previews. This mirrors how `previews.durable_objects` works today. Wrangler names each preview container application `{worker_name}_{preview_slug}_{class_name}`, normalising and shortening the result to what the API accepts. Either change appends a short digest of the composed name, so two names that would otherwise land on one stay distinct. An entry cannot set its own `name`, because application names are unique to an account and a fixed name would collide between two previews of the same Worker. A Durable Object class is backed by at most one container application, so the validator rejects two entries that share a `class_name`. Wrangler skips container applications bound to Durable Object classes that another Worker implements through `script_name`, because the implementing Worker owns its own container application. A binding is not required: a Durable Object declared through `migrations` or `exports` and reached only over `ctx.exports` can still back a container. Every entry must set `class_name`. A `previews.containers` entry whose `class_name` matches no Durable Object class at all is rejected before the preview deployment is created, so a typo fails loudly instead of producing a preview with no container.

Wrangler creates the container applications on `wrangler preview`. Deleting a preview tears them down server side, so `wrangler preview delete` doesn't remove them.

Container build and deploy progress prints to stdout. `wrangler preview --json` suppresses wrangler's own output so it doesn't interleave with the payload, and warnings and errors still go to stderr. Docker's build output and the progress spinner write to stdout directly and bypass that suppression, so parse `--json` from a non interactive shell, where the spinner is skipped, and prefer a prebuilt `image` over a Dockerfile.
