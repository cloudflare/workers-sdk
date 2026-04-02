---
"miniflare": patch
---

Fix source phase imports parsing in Miniflare

Miniflare now uses the `acorn-import-phases` plugin to parse `import source` syntax when analyzing module dependencies. This fixes `ERR_MODULE_PARSE` errors when running Workers that use source phase imports for WebAssembly modules in local development.
