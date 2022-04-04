---
"wrangler": patch
---

fix: resolve raw file bindings correctly in `wrangler dev` local mode

For `wasm_modules`/`text_blobs`/`data_blobs` in local mode, we need to rewrite the paths as absolute so that they're resolved correctly by miniflare. This also expands some coverage for local mode `wrangler dev`.

Fixes https://github.com/cloudflare/wrangler2/issues/740
Fixes https://github.com/cloudflare/wrangler2/issues/416
