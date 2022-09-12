---
"wrangler": patch
---

feat: new internal middleware

A new way of registering middleware that gets bundled and executed on the edge.

- the same middleware functions can be used for both modules workers and service workers
- only requires running esbuild a fixed number of times, rather than for each middleware added
