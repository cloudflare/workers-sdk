---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Skip resource provisioning for asset-only deployments

Previously, asset-only deployments would provision resources even when there was no user Worker script. On a subsequent deploy, we would re-attempt provisioning as the previous asset-only upload would/could not be bound to the previously provisioned resource. Provisioning woul then error as the resource had already been created, blocking the deploy.
