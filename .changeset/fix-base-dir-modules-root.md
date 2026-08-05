---
"wrangler": patch
---

Fix relative imports from nested entry points when using `base_dir` with `no_bundle = true`. Previously, modules were incorrectly resolved relative to the entry point's directory instead of the configured `base_dir`, causing "internal error" failures when importing modules with relative paths like `../foo.js`.
