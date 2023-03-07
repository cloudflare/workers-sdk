---
"wrangler": patch
---

fix: preserve the entrypoint filename when running `wrangler publish --outdir <dir>`.

Previously, this entrypoint filename would sometimes be overwritten with some internal filenames. It should now be based off of the entrypoint you provide for your Worker.
