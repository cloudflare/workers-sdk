---
"wrangler": patch
---

Wait for unbundled rebuilds before shutting down development file watchers

Prevent in-flight module scans from reading deleted build directories during teardown, and dispose of the entrypoint build context when watching unbundled Workers.
