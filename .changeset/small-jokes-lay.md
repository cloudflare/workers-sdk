---
"wrangler": patch
---

fix: `config.site.entry-point` as a breaking deprecation

This makes configuring `site.entry-point` in config as a breaking deprecation, and throws an error. We do this because existing apps with `site.entry-point` _won't_ work in v2.
