---
"wrangler": patch
---

fix: ensure that additional modules appear in the out-dir

When using `find_additional_modules` (or `no_bundle`) we find files that
will be uploaded to be deployed alongside the Worker.

Previously, if an `outDir` was specified, only the Worker code was output
to this directory. Now all additional modules are also output there too.
