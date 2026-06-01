---
"miniflare": patch
---

Fix `wrangler dev` crash under Yarn PnP when the worker emits a structured log or the inspector forwards a stack trace.

`getFreshSourceMapSupport` was unconditionally indexing `require.cache`, but when `miniflare` is `import`ed from ESM under Yarn PnP, Node's ESM->CJS bridge (`loadCJSModule` in `node:internal/modules/esm/translators`) hands the wrapped CJS module a re-invented `require` that only carries `.resolve` and `.main`, with no `.cache`. Fall back to `createRequire(__filename)` in that case so the fresh-load cache-swap keeps working.
