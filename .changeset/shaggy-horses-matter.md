---
"wrangler": patch
---

fix: `--experimental-local` with `wrangler pages dev`

We previously had a bug which logged an error (`local worker: TypeError: generateASSETSBinding2 is not a function`). This has now been fixed.
