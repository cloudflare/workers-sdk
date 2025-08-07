---
"wrangler": patch
---

refactor: switch `getPlatformProxy()` to use Miniflare's dev registry implementation

Updated `getPlatformProxy()` to use Miniflare's dev registry instead of Wrangler's implementation. Previously, you had to start a wrangler or vite dev session before accessing the proxy bindings to connect to those workers. Now the order doesn't matter.
