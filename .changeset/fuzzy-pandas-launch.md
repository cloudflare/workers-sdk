---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add Durable Object-managed Containers to top-level container configuration

Wrangler now accepts `scheduling_policy: "durable_object"` in the top-level `containers` array and creates its namespace-backed application after the Worker upload resolves the Durable Object namespace ID. The namespace ID is also the application ID, so repeated deploys idempotently ensure the same application without name-based lookup, modification, or a Containers rollout.

Durable Object-managed entries accept `class_name`, `scheduling_policy`, an optional `name`, and an optional named `images` map. Scheduler-only fields are rejected. Each image provides either a local `dockerfile` or a digest-pinned managed-registry `image`. Wrangler builds or resolves each image, waits while Cloudflare prepares it for the Containers runtime, and uploads the resulting references with the Worker version for access through `ctx.container.images` and `env.EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES`. Local development support for these entries is deferred to a follow-up.

Existing scheduler-backed entries and Durable Object migrations continue to work unchanged.

With `--containers-rollout=none`, existing Workers retain their deployed Container metadata and image binding even when local `containers` is omitted or empty; local scheduler edits are also ignored. The upload stops if the deployed versions cannot be recovered. Existing Workers for Platforms dispatch scripts reject this flag before upload because their API does not expose enough metadata to preserve Container associations safely. First deployments can still skip Container preparation and rollout. Without this flag, removing managed Containers, including by omitting `containers` entirely, clears the experimental image binding even with `keep_vars`.

`versions deploy` validates the selected versions before changing traffic and creates their Durable Object-managed applications only after deployment succeeds. Both `deploy` and `versions deploy` report partial completion if application creation fails afterward, with instructions to retry the same command.

`EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES` is a temporary, reserved Wrangler binding until native Container image metadata is available. Its class keys identify managed applications during `versions deploy`, including classes with empty image maps. User configuration cannot declare a binding with this name; existing versions that already use it are treated as Container configuration.
