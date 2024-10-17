---
"wrangler": patch
---

fix: improve error messaging when accidentally using Workers commands in Pages project

If we detect a Workers command used with a Pages project (i.e. wrangler.toml contains `pages_output_build_dir`), error with Pages version of command rather than "missing entry-point" etc.
