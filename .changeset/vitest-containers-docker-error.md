---
"@cloudflare/containers-shared": minor
---

Let callers of `prepareContainerImagesForDev()` describe the operation and how to disable Containers when Docker cannot be launched

The new optional `operation` and `disableContainersHint` arguments replace the "before running dev" wording and the advice to set `dev.enable_containers` or pass `--enable-containers=false`. The defaults are unchanged.
