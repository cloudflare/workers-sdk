---
"@cloudflare/vitest-pool-workers": patch
---

fix: adds thread pool to runTests to avoid process starvation

In order to avoid Miniflare spawning threads for all the test files at once, the number of threads is now limited according to `os.availableParallism()` (or `os.cpus().length` as a fallback).
