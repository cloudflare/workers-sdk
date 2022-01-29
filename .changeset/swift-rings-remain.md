---
"wrangler": patch
---

feat: wasm support for local mode in `wrangler dev`

This adds support for `*.wasm` modules into local mode for `wrangler dev`.

In 'edge' mode, we create a javascript bundle, but wasm modules are uploaded to the preview server directly when making the worker definition form upload. However, in 'local' mode, we need to have the actual modules available to the bundle. So we copy the files over to the bundle path. We also pass appropriate `--modules-rule` directive to `miniflare`.

I also added a sample wasm app to use for testing, created from a default `workers-rs` project.

Fixes https://github.com/cloudflare/wrangler2/issues/299
