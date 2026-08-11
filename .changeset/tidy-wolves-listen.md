---
"wrangler": patch
---

Fix remote binding sessions reusing stale binding configurations

Fresh remote proxy sessions sharing the same Worker name now upload distinct proxy artifacts, preventing edge-preview cache reuse from causing `Binding "..." not found` errors.
