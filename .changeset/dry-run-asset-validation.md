---
"wrangler": patch
---

Fix `wrangler deploy --dry-run` skipping asset build-artifact validation checks

Previously, `--dry-run` skipped the entire asset sync step, which meant it also skipped validation that runs during asset manifest building. This included the check that errors when a `_worker.js` file or directory would be uploaded as a public static asset (which can expose private server-side code), as well as the per-file size limit check.

With this fix, `--dry-run` now runs `buildAssetManifest` against the asset directory when assets are configured, performing the same file-system validation as a real deploy without uploading anything or making any API calls.
