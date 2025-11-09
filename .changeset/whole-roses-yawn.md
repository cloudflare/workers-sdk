---
"wrangler": patch
---

Ignores `.dev.vars` if `--env-file` has been explicitly passed

Previously, `.dev.vars` would always be read first, and then any file passed with `--env-file` would override variables in `.dev.vars`. This meant there was no way to ignore `.dev.vars` if you wanted to use a different env file. Now, if `--env-file` is passed, `.dev.vars` will be ignored entirely.
