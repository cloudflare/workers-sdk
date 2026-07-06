---
"wrangler": patch
---

Fix a potential crash when displaying certain CLI output

Previously, some CLI output with no content lines could cause a crash. This is now handled correctly.
