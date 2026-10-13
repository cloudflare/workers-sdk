---
"wrangler": minor
---

Upload source maps by default for `wrangler deploy`, `wrangler versions upload` and `wrangler preview`

When `upload_source_maps` isn't set in config or via `--upload-source-maps`, Wrangler now generates and uploads source maps so stack traces in logs and `wrangler tail` point at your original source without extra setup. In this default mode, source maps that can't be resolved (for example inline `data:` maps or missing `.map` files from a custom build) are skipped rather than failing the upload. Setting `upload_source_maps = true` keeps the existing strict behaviour, and `upload_source_maps = false` (or `--no-upload-source-maps` for deploy and versions upload) opts out.

`wrangler build --experimental-cf-build-output` is unchanged and still only includes source maps when `upload_source_maps = true`.
