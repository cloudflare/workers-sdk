---
"wrangler": patch
---

fix: apply source mapping to deployment validation errors

Previously if a Worker failed validation during `wrangler deploy`, the displayed error would reference locations in built JavaScript files. This made it more difficult to debug validation errors. This change ensures these errors are now source mapped, referencing locations in source files instead.
