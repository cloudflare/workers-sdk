---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

Add namespace-backed Container Instance Group configuration

Wrangler now accepts a Container Instance Group configuration on live Durable Object `exports` entries and configures the namespace-backed group through the Containers API after the Worker upload resolves its namespace ID.

The nested block accepts an optional `images` array. Each image entry provides an `image` source and Worker `binding`. In that mode, `wrangler deploy` builds and pushes each image, waits while Cloudflare prepares it for the Containers runtime, and injects each digest-pinned image reference into its generated Worker binding before upload.

Existing string-valued `exports.<Class>.container` references and top-level `containers` entries continue to use the application-backed deployment flow unchanged.
