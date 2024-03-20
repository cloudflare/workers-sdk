---
"miniflare": patch
---

fix: allow `script`s without `scriptPath`s to import built-in modules

Previously, if a string `script` option was specified with `modules: true` but without a corresponding `scriptPath`, all `import`s were forbidden. This change relaxes that restriction to allow imports of built-in `node:*`, `cloudflare:*` and `workerd:*` modules without a `scriptPath`.
