---
"wrangler": patch
---

Remove deprecated `--experimental-vm-modules` flag and prevent silent exit on unexpected errors

`wrangler` was silently exiting with code 1 on Node.js v26 with no error message shown. This release fixes two independent issues that caused this behaviour:

1. A stale Node.js flag that caused unexpected behaviour on Node.js v26 has been removed.

2. If an error occurs in a situation where the normal error reporting path itself fails, `wrangler` now always prints the original error to stderr so the cause is visible rather than silently disappearing.
