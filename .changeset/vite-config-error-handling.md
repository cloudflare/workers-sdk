---
"wrangler": patch
---

Improve error handling for Vite config transformations

Replace assertions with proper error handling when transforming Vite configs. When Wrangler encounters a Vite config that uses a function or lacks a plugins array, it now provides clear, actionable error messages instead of crashing with assertion failures. The check function gracefully skips incompatible configs with debug logging.
