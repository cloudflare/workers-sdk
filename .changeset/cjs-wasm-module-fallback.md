---
"@cloudflare/vitest-pool-workers": patch
---

fix: support `require("./x.wasm?module")` in CommonJS dependencies

Previously, only literal `await import("./x.wasm?module")` specifiers were rewritten through the static analysis path added in #11094. CommonJS dependencies that use `require("./x.wasm?module")` reach the module-fallback service at runtime, where the `?module` suffix went unhandled. The fallback either failed with `No such module "<abs>/x.wasm?module"` or, when a `CompiledWasm` rule was configured, attempted to evaluate the WebAssembly bytes as JavaScript.

However, these `require()`s work in deployed workers because esbuild's bundler statically rewrites these `require()` calls into ES dynamic imports. vitest-pool-workers' Vite-based pipeline doesn't do that rewrite and instead defers to the module-fallback at runtime.

The module-fallback now strips `?module` from the resolved target and synthesizes a CommonJS wrapper that re-`require`s the underlying `.wasm` by absolute path, exposing it on `default` to match what workerd produces for `CompiledWasm` modules.
