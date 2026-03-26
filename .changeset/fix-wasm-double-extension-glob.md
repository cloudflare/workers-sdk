---
"miniflare": patch
---

fix: glob patterns for module rules no longer match double-extension filenames like `foo.wasm.js`

Previously, the `globsToRegExps` helper compiled glob patterns without a trailing `$` anchor. This caused patterns like `**/*.wasm` to match any path containing `.wasm` as a substring — including filenames such as `foo.wasm.js` or `main.wasm.test.ts`.

When using `@cloudflare/vitest-pool-workers` with a `wrangler.configPath`, Wrangler's default `CompiledWasm` module rule (`**/*.wasm`) was silently applied to test files whose names contained `.wasm`, causing them to be loaded as WebAssembly binaries instead of JavaScript and failing at runtime.

The fix restores the `$` end anchor in the compiled regex so that `**/*.wasm` only matches paths that literally end in `.wasm`, while the leading `^` remains absent to allow matching anywhere within an absolute path.
