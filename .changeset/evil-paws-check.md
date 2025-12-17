---
"wrangler": minor
"@cloudflare/containers-shared": patch
---

For containers being created in a FedRAMP high environment, registry credentials are encrypted by the container platform.
Update wrangler to correctly send a request to configure a registry for FedRAMP containers.
