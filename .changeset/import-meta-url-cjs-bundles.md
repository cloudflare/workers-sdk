---
"miniflare": patch
"create-cloudflare": patch
---

Provide a valid `import.meta.url` when bundling ESM dependencies into CJS output

The builds inline ESM dependencies that use `createRequire(import.meta.url)`. Provide a file URL when producing the CommonJS bundles so these dependencies can initialize successfully.
