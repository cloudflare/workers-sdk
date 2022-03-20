---
"wrangler": patch
---

fix: default `watch_dir` to `src` of project directory

Via wrangler 1, when using custom builds in `wrangler dev`, `watch_dir` should default to `src` of the "project directory" (i.e - wherever the `wrangler.toml` is defined if it exists, else in the cwd.

Fixes https://github.com/cloudflare/wrangler2/issues/631
