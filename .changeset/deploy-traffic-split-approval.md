---
"@cloudflare/deploy-helpers": minor
---

Require explicit approval before replacing an active Worker traffic split when deploy consumers opt in

A declined replacement stops before queue provisioning or upload and returns a distinct result. Deploy also rechecks the split immediately before changing traffic. Wrangler's default behavior is unchanged.
