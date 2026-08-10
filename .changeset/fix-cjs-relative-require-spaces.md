---
"@cloudflare/vitest-pool-workers": patch
---

Fix module resolution for relative `require()` inside CJS deps when the project path contains spaces

When a project lives under a directory with a space in its name, externalized CommonJS dependencies that use relative `require()` calls (e.g. `require("./lib/impl.js")`) would fail with "No such module" because workerd percent-encodes the space as `%20` in the module name, and subsequent relative imports inherit that encoding. The module fallback handler now retries resolution with decoded paths when the percent-encoded path doesn't exist on disk.
