---
"wrangler": patch
---

Fix autoconfig handling of Next.js apps with CJS config files and incompatible Next.js versions

Previously, `wrangler setup` and `wrangler deploy --x-autoconfig` would fail when working with Next.js applications that use CommonJS config files (next.config.cjs) or have versions of Next.js that don't match the required peer dependencies. The autoconfig process now uses dynamic imports and forced installation to handle these scenarios gracefully.
