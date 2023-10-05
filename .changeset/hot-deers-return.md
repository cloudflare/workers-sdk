---
"wrangler": patch
---

fix: allow `__STATIC_CONTENT_MANIFEST` module to be imported anywhere

`__STATIC_CONTENT_MANIFEST` can now be imported in subdirectories when
`--no-bundle` or `find_additional_modules` are enabled.
