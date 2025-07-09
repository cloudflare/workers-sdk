---
"wrangler": patch
---

Build container images without the user's account ID. This allows containers to be built and verified in dry run mode (where we do not necessarily have the user's account info).

When we push the image to the managed registry, we first re-tag the image to include the user's account ID so that the image has the full resolved image name.
