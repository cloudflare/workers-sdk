---
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Keep local Container images available for upload retries

Keep prebuilt local image tags available until the caller finishes uploading the Worker and deploying its Container applications, so a later failure can be retried without rebuilding. When image push commands request cleanup, remove the source tag only after the push succeeds.
