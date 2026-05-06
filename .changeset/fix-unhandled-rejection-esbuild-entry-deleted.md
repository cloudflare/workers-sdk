---
"wrangler": patch
---

Fix unhandled promise rejection when the worker entry point is deleted or moved during `wrangler dev` hot-reload — now logs a warning and skips the update instead of crashing
