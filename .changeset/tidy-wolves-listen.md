---
"wrangler": patch
---

Fix remote binding sessions reusing stale binding configurations

Starting a new remote bindings session that reuses a Worker name no longer picks up the bindings from a previous session, which could cause `Binding "..." not found` errors.
