---
"@cloudflare/vite-plugin": patch
---

Fix `vite dev` crashing when Worker entry files use standard decorators

The Vite plugin now forces decorator lowering in Vite's esbuild transform before worker modules are evaluated in development. Previously, TypeScript configs such as `target: "ES2022"` could leave `@decorator` syntax in dev output, which caused `Invalid or unexpected token` when workerd evaluated the module.
