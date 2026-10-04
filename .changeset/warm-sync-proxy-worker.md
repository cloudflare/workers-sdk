---
"miniflare": patch
---

Start the synchronous proxy worker before returning proxies

`getBindings()`, `getDurableObjectNamespace()` and the other proxy getters now wait for the worker that serves synchronous proxy calls to start, instead of the first synchronous call blocking Node's main thread while it boots. That block also stalled every other Miniflare instance served from the same process, such as Vitest pool workers running test files in parallel.
