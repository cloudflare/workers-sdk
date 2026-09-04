---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add namespace-backed Container Instance Group configuration

Wrangler now accepts a Container Instance Group configuration on live Durable Object `exports` entries and creates its namespace-backed `scheduling_policy: "durable_object"` application after the Worker upload resolves its namespace ID. The namespace ID is also the application ID, so repeated deploys idempotently ensure the same application without name-based lookup, modification, or a Cloudchamber rollout.

The nested block accepts an optional named `images` map. Each entry provides either a local `dockerfile` or a digest-pinned managed-registry `image`. Wrangler builds or resolves each image, waits while Cloudflare prepares it for the Containers runtime, and uploads the resulting references with the Worker version for access through `ctx.container.images`.

Existing string-valued `exports.<Class>.container` references and top-level `containers` entries continue to use the application-backed deployment flow unchanged.
