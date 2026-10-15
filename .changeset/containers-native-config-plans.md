---
"@cloudflare/containers-shared": minor
---

Export Container planning helpers for native Cloudflare configuration

Internal consumers can now create local-development and preview Container plans directly from parsed `cloudflare.config.ts` and Build Output configuration using `createContainerDevPlanForCfConfig` and `createContainerPreviewPlanForCfConfig`. The shared image handling also resolves Dockerfile paths consistently and avoids retagging an image to itself when a preview uses its existing reference.
