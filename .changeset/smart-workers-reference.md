---
"@cloudflare/config": minor
---

Enable referencing Worker configs directly in cross-Worker bindings

`defineWorker` and `defineSettings` now return ordinary config objects, functions, or promises. Cross-Worker bindings can use a `defineWorker` result as their `worker`, preserving type inference while resolving and parsing the referenced config only once.
