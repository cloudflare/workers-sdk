---
"wrangler": minor
---

feature: Add source map support for Workers

Adds the `source_maps` boolean config option. When enabled, source maps included in the build output are uploaded alongside the built code modules. Uploaded source maps can then be used to remap stack traces emitted by the Workers runtime.
