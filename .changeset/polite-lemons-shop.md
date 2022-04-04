---
"wrangler": patch
---

refactor: remove `process.exit()` from the pages code

This enables simpler testing, as we do not have to spawn new child processes
to avoid the `process.exit()` from killing the jest process.

As part of the refactor, some of the `Error` classes have been moved to a
shared `errors.ts` file.
