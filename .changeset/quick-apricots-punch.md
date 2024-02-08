---
"wrangler": patch
---

fix: allow `port` option to be specified with `unstable_dev()`

Previously, specifying a non-zero `port` when using `unstable_dev()` would try to start two servers on that `port`. This change ensures we only start the user-facing server on the specified `port`, allow `unstable_dev()` to startup correctly.
