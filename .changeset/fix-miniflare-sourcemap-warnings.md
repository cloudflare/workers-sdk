---
"miniflare": patch
---

Fix sourcemap warnings caused by references to files outside the package boundary

miniflare's bundled sourcemap contained `sources` entries pointing into `node_modules` dependencies (zod, capnp-es, chokidar, etc.), which produced dozens of warnings in pnpm monorepos when tools like Vite or Vitest validated the sourcemaps at runtime. The build now inlines `sourcesContent` and patches any null entries left by upstream dependencies that don't publish their original source files
