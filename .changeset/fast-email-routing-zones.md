---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Apply Email Routing changes across independent zones concurrently

Wrangler now limits concurrent zone updates while preserving the Email Routing plan order within each zone. Deployments that configure addresses across multiple zones complete faster without breaking delete-before-add transitions at a zone's rule limit.
