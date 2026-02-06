---
"wrangler": patch
---

fix: Throw a descriptive error when autoconfig cannot detect an output directory

`getDetailsForAutoConfig()` now throws an error if no output directory can be detected, and `runAutoConfig()` asserts the directory is present.
