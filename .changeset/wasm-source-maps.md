---
"wrangler": minor
---

Upload source maps for WebAssembly modules

`upload_source_maps` now also covers WebAssembly modules: Wrangler uploads the source map named by a module's `sourceMappingURL` custom section, such as the one `worker-build` writes for Rust Workers with `source-map = true`. As with JavaScript, a map that can't be found is skipped unless `upload_source_maps = true`, and `upload_source_maps = false` uploads none.
