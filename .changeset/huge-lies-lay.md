---
"wrangler": patch
---

fix experimental remoteBindings flag not being properly propagated in `getPlatformProxy`

The changes here address the fact that experimental remoteBindings flag that user can set in their `getPlatformProxy` call is currently not being properly propagated, causing most of the bindings not to actually be treated as remote ones
