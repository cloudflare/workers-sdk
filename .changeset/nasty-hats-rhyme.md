---
"wrangler": minor
---

feat: experimental workers assets can be ignored by adding a .assetsignore file

This file can be added to the root of the assets directory that is to be uploaded alongside the Worker
when using `experimental_assets`.

The file follows the `.gitignore` syntax, and any matching paths will not be included in the upload.
