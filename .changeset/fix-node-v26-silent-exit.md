---
"wrangler": patch
---

fix: remove deprecated `--experimental-vm-modules` flag and prevent silent exit on unexpected errors

`wrangler` was silently exiting with code 1 on Node.js v26 with no error message. Two changes address this:

1. Remove `--experimental-vm-modules` from the child process spawn flags in `bin/wrangler.js`. This flag was deprecated when `vm.Module` became stable in Node.js v22, and the compiled `wrangler-dist/cli.js` does not use VM Modules. The stale flag could cause unexpected behaviour on Node.js v26.

2. Wrap the `handleError()` call in a try-catch so that if `handleError()` itself throws, the original error message is written directly to stderr instead of being silently swallowed by the top-level `.catch()` in `cli.ts`.
