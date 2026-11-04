---
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
---

Defer local container image cleanup to the upload workflow

Keep prebuilt local image tags available until the caller finishes uploading the Worker and deploying its Container applications, so a later failure can be retried without rebuilding. When image push commands request cleanup, remove the source tag only after the push succeeds.
