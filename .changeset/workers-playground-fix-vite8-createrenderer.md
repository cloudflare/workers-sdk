---
"@cloudflare/workers-playground": patch
---

fix: resolve TypeError: createRenderer is not a function when built with Vite 8

Vite 8 switched its bundler from Rollup to rolldown. The `@cloudflare/style-provider` package ships a hybrid ESM+CJS build (its `es/` directory uses `require()` internally), which rolldown mishandles by generating an anonymous, unreachable module initializer — leaving `createRenderer` as `undefined` at runtime.

Fixed by aliasing `@cloudflare/style-provider` to its CJS entry (`lib/index.js`) in `vite.config.ts`. Rolldown handles plain CJS correctly via its interop layer.
