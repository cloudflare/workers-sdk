---
"@cloudflare/shared-ast-primitives": minor
---

Add `@cloudflare/shared-ast-primitives`, an internal library wrapping `recast` with helpers for authoring string-in/string-out AST transforms — `parseJs`/`parseTs`/`parseFile` for parsing, `transformFile` and `mergeObjectProperties` for manipulation, and the `print`/`types` primitives re-exported so consumers don't take a direct dependency on `recast`. Used by the Cloudflare codemods CLI, C3, and autoconfig.
