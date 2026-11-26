---
"wrangler": patch
---

Fix `getPlatformProxy()` hanging on Node.js on the first call to a remote binding.

The remote session authenticates and connects in a separate process. This avoids blocking authentication without changing the binding API or connecting eagerly. Set any auth environment variables before calling `getPlatformProxy()`, since the subprocess inherits them when the proxy is created. Remote bindings remain unsupported on Bun.
