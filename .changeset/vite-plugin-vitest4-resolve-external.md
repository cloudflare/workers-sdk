---
"@cloudflare/vite-plugin": patch
---

Allow `resolve.external` containing only Node.js built-ins in Worker environments

Vitest 4 automatically sets `resolve.external` to the full list of Node.js built-in
modules for non-standard Vite environments via its internal `runnerTransform` plugin.
Previously, the Cloudflare Vite plugin rejected any non-empty `resolve.external` array,
throwing an incompatibility error on startup when used alongside Vitest 4.

Built-in module entries (both bare `fs` and `node:fs` forms) are now filtered out
before validation. The error is only thrown when `resolve.external` is `true` or
contains non-built-in package names that would prevent user code from being bundled
into the Worker.
