---
"wrangler": patch
---

fix: the pathing for the template was resolving using `__dirname` into the esbuild file which then used a relative path back from pages. When ran inside a test would get a resolved absolute path to the template from "pages/pages/functions/template-workers.ts
