---
"wrangler": minor
---

feat: Support sourcemaps in DevTools

Intercept requests from DevTools in Wrangler to inject sourcemaps and enable folders in the Sources Panel of DevTools. When errors are thrown in your Worker, DevTools should now show your source file in the Sources panel, rather than Wrangler's bundled output.
