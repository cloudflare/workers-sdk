---
"@cloudflare/vitest-plugin": patch
---

Suppress `Aborting engine` uncaught exception noise when testing Workflow failure paths

When a Workflow step throws a `NonRetryableError`, or an instance is terminated, the Workflows engine aborts itself on purpose. workerd reports that abort as `broken.outputGateBroken; jsg.Error: Aborting engine: ...`, which was printed to stderr as an uncaught exception even though the tests were behaving correctly. These messages are now filtered, like the existing `Instance dispose` one.
