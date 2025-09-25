---
"wrangler": patch
---

fix: allow Workflow bindings when calling getPlatformProxy()

Workflow bindings are not supported in practice when using `getPlatformProxy()`.
But their existence in a Wrangler config file should not prevent other bindings from working.
Previously, calling `getPlatformProxy()` would crash if there were any Workflow bindings defined.
Now, instead, you get a warning telling you that these bindings are not available.
