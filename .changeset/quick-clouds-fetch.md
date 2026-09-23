---
"@cloudflare/deploy-helpers": minor
---

Remove the Cloudflare SDK dependency from deploy helpers

`DeployHelpersContext` no longer requires `createCloudflareClient`; Worker subdomain lookups now use the injected `fetchResult` helper with retries. Consumers should remove the client factory from their deploy-helpers context initialization.
