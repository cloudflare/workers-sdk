---
"wrangler": patch
---

Fix source phase imports in non-bundled Workers

Wrangler now preserves `import source` syntax when it runs esbuild in non-bundling paths such as module format detection. This fixes `--no-bundle` deployments for Workers that import WebAssembly using source phase imports.
