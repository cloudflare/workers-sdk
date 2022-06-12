---
"wrangler": patch
---

feat: `--assets` / `config.assets` to serve a folder of static assets

This adds support for defining `assets` in `wrangler.toml`. You can configure it with a string path, or a `{bucket, include, exclude}` object (much like `[site]`). This also renames the `--experimental-public` arg as `--assets`.

Via https://github.com/cloudflare/wrangler2/issues/1162
