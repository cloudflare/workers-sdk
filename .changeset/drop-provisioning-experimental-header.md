---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Drop the "Experimental:" prefix from the resource provisioning header now that automatic provisioning is generally available. The deploy output now reads `The following bindings need to be provisioned:`.
