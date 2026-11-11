---
"@cloudflare/vite-plugin": minor
---

Copy source maps of WebAssembly modules into the build output

When an imported `.wasm` module has a `sourceMappingURL` custom section, such as the one `worker-build` writes for Rust Workers with `source-map = true`, the plugin now copies the map it names next to the emitted module, so it is uploaded with the Worker. Each map gets a name unique to its module, which the module's section is updated to, and the map's `file` names the module as it is uploaded. This follows `build.sourcemap`, like JavaScript source maps. Maps named by an absolute URL are left out.
