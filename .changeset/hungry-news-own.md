---
"wrangler": patch
---

fix: ask for confirmation before creating a new Worker when uploading secrets

Previously, `wrangler secret put KEY --name non-existent-worker` would automatically create a new Worker with the name `non-existent-worker`. This fix asks for confirmation before doing so (if running in an interactive context). Behaviour in non-interactive/CI contexts should be unchanged.
