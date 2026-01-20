---
"wrangler": patch
---

Fix DevTools showing sources from only one worker in multi-worker dev

Previously, when running `wrangler dev` with multiple workers via `-c` flags, DevTools would only show sources from the last worker to complete bundling. This made it difficult to debug specific workers in a multi-worker setup.

Now, sources from all workers are available in DevTools. When you open the Sources panel, you can navigate to and set breakpoints in any worker's code.
