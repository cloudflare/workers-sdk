---
"wrangler": patch
---

Fix source phase imports in bundled and non-bundled Workers

Wrangler now preserves `import source` syntax when it runs esbuild, including module format detection and bundled deploy output. This fixes both `--no-bundle` and bundled deployments for Workers that import WebAssembly using source phase imports.
