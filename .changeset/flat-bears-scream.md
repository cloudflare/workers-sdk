---
"wrangler": patch
---

fix: implicitly cleanup (call `stop()`) in `unstable_dev` if the returned Promise rejected and the `stop()` function was not returned
