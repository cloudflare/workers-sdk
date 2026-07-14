---
"miniflare": patch
"create-cloudflare": patch
---

Provide a valid `import.meta.url` when bundling ESM dependencies into CJS output

The esbuild-based builds inline `@cloudflare/workers-utils`, whose ESM output contains a `createRequire(import.meta.url)` shim. esbuild stubs `import.meta.url` to `undefined` in CJS output, causing `createRequire(undefined)` to throw on load. Inject a real file URL (matching wrangler's existing approach) so the bundled code works.
