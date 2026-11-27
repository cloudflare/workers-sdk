---
"@cloudflare/deploy-helpers": minor
---

Let deploy consumers opt in to explicit approval before replacing an active Worker traffic split. A declined replacement stops before queue provisioning or upload and returns a distinct result. Wrangler's default behavior is unchanged.
