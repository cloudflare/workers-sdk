---
"wrangler": patch
---

fix: error when entry doesn't exist

This adds an error when we use an entry point that doesn't exist, either for `wrangler dev` or `wrangler publish`, and either via cli arg or `build.upload.main` in `wrangler.toml`. By using a common abstraction for `dev` and `publish`, This also adds support for using `build.config.main`/`build.config.dir` for `wrangler dev`.

- Fixes https://github.com/cloudflare/wrangler2/issues/418
- Fixes https://github.com/cloudflare/wrangler2/issues/390
