---
"wrangler": patch
---

Preserve Wrangler's published API when building with tsdown

Build Wrangler's CLI, embedded Workers, and experimental configuration entry point with tsdown. Bundle the shared configuration types and install the dependencies needed to resolve the public declarations, including in projects with `skipLibCheck` disabled.
