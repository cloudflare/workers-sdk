---
"@cloudflare/vite-plugin": minor
---

Copy source maps of WebAssembly modules into the build output

When an imported `.wasm` module has a `sourceMappingURL` custom section, such as the one `worker-build` writes for Rust Workers with `source-map = true`, the plugin now copies the map it names next to the emitted module and sets the map's `file` to the module's name in the Worker bundle, so it is uploaded with the Worker. This follows `build.sourcemap`, like JavaScript source maps.
