---
"wrangler": patch
---

Do not crash when processing environment configuration.

Previously there were corner cases where the configuration might just crash.
These are now handled more cleanly with more appropriate warnings.
