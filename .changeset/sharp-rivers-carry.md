---
"wrangler": patch
---

fix: ensure logs containing `at ` not truncated to `at [object Object]`

Previously, logs containing `at ` were always treated as stack trace call sites requiring source mapping. This change updates the call site detection to avoid false positives.
