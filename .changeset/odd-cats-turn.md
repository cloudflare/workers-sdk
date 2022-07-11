---
"wrangler": patch
---

fix: Check `config.assets` when deciding whether to include a default entry point.

An entry point isn't mandatory when using `--assets`, and we can use a default worker when doing so. This fix enables that same behaviour when `config.assets` is configured.
