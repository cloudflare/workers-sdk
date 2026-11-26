---
"wrangler": patch
---

Fix `getPlatformProxy()` hanging on the first call to a lazily connected remote binding, such as a K2 producer

The remote session authenticates and connects in a separate Node.js process. This avoids blocking authentication without changing the binding API or connecting eagerly.
