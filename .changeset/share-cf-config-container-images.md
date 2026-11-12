---
"@cloudflare/containers-shared": minor
---

Add `prepareContainerImagesForCfConfig` for building or pulling the Container images of a `cloudflare.config.ts` project

Tools that run Containers from cf config can now share one implementation, including Cloudflare-managed registry authentication, instead of keeping their own copies.
