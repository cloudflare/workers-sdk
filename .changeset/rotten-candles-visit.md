---
"wrangler": patch
---

fix: rename `--no-build` to `--no-bundle`

This fix renames the `--no-build` cli arg to `--no-bundle`. `no-build` wasn't a great name because it would imply that we don't run custom builds specified under `[build]` which isn't true. So we rename closer to what wrangler actually does, which is bundling the input. This also makes it clearer that it's a single file upload.
