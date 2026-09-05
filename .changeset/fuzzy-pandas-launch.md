---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add Durable Object-managed Containers to top-level container configuration

Wrangler now accepts `scheduling_policy: "durable_object"` in the top-level `containers` array and creates its namespace-backed application after the Worker upload resolves the Durable Object namespace ID. The namespace ID is also the application ID, so repeated deploys idempotently ensure the same application without name-based lookup, modification, or a Containers rollout.

Durable Object-managed entries accept `class_name`, `scheduling_policy`, an optional `name`, and an optional named `images` map. Each image provides either a local `dockerfile` or a digest-pinned managed-registry `image`. Wrangler builds or resolves each image, waits while Cloudflare prepares it for the Containers runtime, and uploads the resulting references with the Worker version for access through `ctx.container.images` and `env.EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES`.

Existing scheduler-backed entries and Durable Object migrations continue to work unchanged.

With `--containers-rollout=none`, existing Workers retain their deployed Container metadata and image binding even when local `containers` is omitted or empty. The upload stops if the deployed versions cannot be recovered. Existing Workers for Platforms dispatch scripts reject this flag before upload because their API does not expose enough metadata to preserve Container associations safely. First deployments can still skip Container preparation and rollout.

`versions deploy` validates the selected versions before changing traffic and creates their Durable Object-managed applications only after deployment succeeds. If application creation fails afterward, Wrangler reports the partial completion and the same command can be retried.

Version uploads include a versioned metadata marker so that `versions deploy` recognizes generated Container image bindings, including empty image maps, without treating an ordinary user variable with the same image-binding name as Container configuration. Rollout skip inherits the marker together with the image binding. Re-upload versions created with earlier experimental builds to include the marker before using `versions deploy` to reconcile their managed Containers.
