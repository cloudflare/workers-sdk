---
"@cloudflare/containers-shared": minor
---

Let callers word the hint in the Docker error of `prepareContainerImagesForDev()`

`prepareContainerImagesForDev()` now takes `dockerUnavailableHint`, the text to add to the error when Docker cannot be reached, instead of `configFileName`. The hint it built from `configFileName` named a Wrangler setting and a Wrangler flag, which do not apply to every caller.
