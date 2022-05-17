---
"wrangler": patch
---

fix: Incorrect extension extraction from file paths. Our extension extraction logic was taking into account folder names, which can include periods. The logic would incorrectly identify a file path of .well-known/foo as having the extension of well-known/foo when in reality it should be an empty string.
