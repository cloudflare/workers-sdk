---
"@cloudflare/containers-shared": minor
---

Let callers of `prepareContainerImagesForDev()` describe the operation when Docker cannot be launched

The new optional `operation` argument replaces the "before running dev" wording. It defaults to `"running dev"`.
