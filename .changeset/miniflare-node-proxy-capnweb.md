---
"miniflare": patch
"wrangler": patch
---

Make bindings used from Node.js behave like Workers RPC in `getPlatformProxy()` and Miniflare's binding getters

Bindings returned by `getPlatformProxy()`, `getBindings()`, `getWorker()`, `getCaches()` and Miniflare's `get*()` binding methods now behave like Workers RPC: calls can be pipelined, functions can be passed as callbacks, and calls and properties return promise-like values that must be awaited. Durable Object IDs, R2 objects and other values synchronous APIs return stay synchronous. Values such as `Map`s, `Set`s, custom error names and properties, and objects with keys like `constructor` are now sent in both directions, and calls no longer block the Node.js main thread, except to get Durable Object IDs and D1 bookmarks.
