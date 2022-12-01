---
"wrangler": patch
---

fix: d1 not using the preview database when using `wrangler dev`

After this fix, wrangler will correctly connect to the preview database, rather than the prod database when using `wrangler dev`
