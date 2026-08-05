---
"wrangler": patch
---

[wrangler] Fix `No such module "wrangler:modules-watch"` crash when running `wrangler pages dev` with `no_bundle = true`

Running `wrangler dev` or `wrangler pages dev` with bundling disabled (`"no_bundle": true` in `wrangler.json`, or the `--no-bundle` flag) no longer crashes at startup with `Uncaught Error: No such module "wrangler:modules-watch"`. Live reloading on file changes continues to work as before.
