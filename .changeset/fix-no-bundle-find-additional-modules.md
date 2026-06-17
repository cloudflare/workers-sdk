---
"wrangler": patch
---

Respect `find_additional_modules = false` when `no_bundle` is set

When using `no_bundle = true`, wrangler was always scanning for and attaching additional modules even if `find_additional_modules` was explicitly set to `false` in the config. Additional modules are now only collected when `find_additional_modules` is not `false`, consistent with the bundled code path.
