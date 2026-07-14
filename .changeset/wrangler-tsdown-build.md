---
"wrangler": patch
---

Build with tsdown instead of tsup

Wrangler's bundle is now produced with tsdown (rolldown) rather than tsup (esbuild). This is an internal build-tooling change with no user-facing behaviour difference: the CLI output, embedded workers, and published entry points are unchanged.
