---
"wrangler": patch
---

ci: ensure that the SPARROW_SOURCE_KEY is included in release builds

Previously, we were including the key in the "build" step of the release job.
But this is only there to check that the build doesn't fail.
The build is re-run inside the publish step, which is part of the "changeset" step.
Now, we include the key in the "changeset" step to ensure it is there in the build that is published.
