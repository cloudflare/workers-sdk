---
"@cloudflare/runtime-types": patch
---

Load the Workers runtime only when generating runtime types

Defer loading workerd until `generateRuntimeTypes()` is called, and load Miniflare only on a cache miss. Importing the package or using its header helpers no longer resolves the workerd binary, so tooling can use these helpers on platforms without a supported runtime.
