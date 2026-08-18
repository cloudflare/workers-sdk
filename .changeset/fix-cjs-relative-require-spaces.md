---
"@cloudflare/vitest-pool-workers": patch
---

Fix module resolution for relative `require()` inside CJS deps when the project path contains spaces

When a project lives under a directory with a space in its name, externalized CommonJS dependencies that use relative `require()` calls (e.g. `require("./lib/impl.js")`) would fail with "No such module" because `workerd` preserves URL encoding in the module name. Encoded module paths are now handled deterministically before CommonJS resolution without altering literal percent sequences.
