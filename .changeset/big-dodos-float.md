---
"wrangler": patch
---

fix: support `build.upload.dir` when using `build.upload.main`

Although, `build.upload.dir` is deprecated, we should still support using it when the entry-point is being defined by the `build.upload.main` and the format is `modules`.

Fixes #413
