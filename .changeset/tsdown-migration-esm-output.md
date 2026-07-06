---
"@cloudflare/workers-utils": patch
"@cloudflare/workers-auth": patch
"@cloudflare/deploy-helpers": patch
---

Build with tsdown so the ESM output can be loaded in a pure-ESM context

Previously these packages were bundled with tsup, whose ESM output replaced bundled CommonJS dependencies' `require`/`__filename` usage with a shim that throws `Dynamic require of "..." is not supported`. This broke consumers that load these packages as external ESM at runtime. Switching to tsdown emits a working `createRequire` shim so the packages can be imported directly as ESM.
