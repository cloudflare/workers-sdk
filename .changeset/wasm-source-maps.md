---
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/codemods": patch
---

Add `upload_wasm_source_maps` to upload source maps for WebAssembly modules

With `upload_wasm_source_maps = true`, Wrangler uploads the source map named by each WebAssembly module's `sourceMappingURL` custom section, such as the one `worker-build` writes for Rust Workers with `source-map = true`. The setting is off by default and independent of `upload_source_maps`, which still covers JavaScript modules, so either kind of source map can be uploaded without the other. Once enabled, a missing source map fails the upload.
