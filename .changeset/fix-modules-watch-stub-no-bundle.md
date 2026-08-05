---
"wrangler": patch
---

[wrangler] Fix `No such module "wrangler:modules-watch"` crash when running `wrangler pages dev` with `no_bundle = true`

When `bundle: false` (e.g. `"no_bundle": true` in `wrangler.json`, or `--no-bundle` flag), esbuild does not resolve imports inside injected files. Previously, `modules-watch-stub.js` was always injected whenever `watch: true`, regardless of the `bundle` option. This left `import "wrangler:modules-watch"` as an unresolved import in the output, causing a runtime crash in workerd: `Uncaught Error: No such module "wrangler:modules-watch"`.

The fix is to only inject `modules-watch-stub.js` when `bundle: true`. When `bundle: false`, file-system watching is already handled via chokidar, so the esbuild-internal watch stub is not needed.

Fixes #14845.
