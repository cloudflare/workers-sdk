---
"wrangler": patch
---

fix: avoid injecting esbuild watch stubs into production Worker code

When we added the ability to include additional modules in the deployed bundle of a Worker,
we inadvertently also included some boiler plate code that is only needed at development time.

This fix ensures that this code is only injected if we are running esbuild in watch mode
(e.g. `wrangler dev`) and not when building for deployment.

It is interesting to note that this boilerplate only gets included in the production code
if there is an import of CommonJS code in the Worker, which esbuild needs to convert to an
ESM import.

Fixes [#4269](https://github.com/cloudflare/workers-sdk/issues/4269)
