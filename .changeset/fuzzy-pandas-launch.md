---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add Durable Object-managed Containers to top-level container configuration

Wrangler now accepts `scheduling_policy: "durable_object"` in the top-level `containers` array and creates its namespace-backed application after the Worker upload resolves the Durable Object namespace ID. The namespace ID is also the application ID, so repeated deploys idempotently ensure the same application without name-based lookup, modification, or a Containers rollout.

Durable Object-managed entries accept only `class_name`, `scheduling_policy`, and an optional named `images` map. Each image provides either a local `dockerfile` or a digest-pinned managed-registry `image`. Wrangler builds or resolves each image, waits while Cloudflare prepares it for the Containers runtime, and uploads the resulting references with the Worker version for access through `ctx.container.images` and `env.EXPERIMENTAL_CLOUDFLARE_CONTAINER_IMAGES`.

Existing scheduler-backed entries and Durable Object migrations continue to work unchanged.
