---
"wrangler": patch
---

fix: `site.entry-point` is no longer a hard deprecation

To make migration of v1 projects easier, Sites projects should still work, including the `entry-point` field (which currently errors out). This enables `site.entry-point` as a valid entry point, with a deprecation warning.
