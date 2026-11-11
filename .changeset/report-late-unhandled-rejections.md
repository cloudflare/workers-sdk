---
"@cloudflare/vitest-plugin": patch
---

Fix test files never finishing when a socket read rejects after a Worker handler has answered

Previously, if a handler finished while a socket was still being read, for example a database client's connection, the read's rejection could leave `vitest run` waiting forever after the tests passed. Vitest now reports the unhandled error and the run ends.
