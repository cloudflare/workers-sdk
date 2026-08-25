---
"@cloudflare/vitest-plugin": minor
---

Support Workerd's new module registry in Workers Vitest tests

The pool now follows Workerd's V2 module fallback protocol when `new_module_registry` is selected while retaining the V1 path for `legacy_module_registry`. Tests using the new registry preserve URL-based `import.meta` behavior and load CommonJS dependencies as native CommonJS modules with named exports.
