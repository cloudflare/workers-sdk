---
"wrangler": patch
---

fix: generate valid URL route paths for pages on Windows

Previously route paths were manipulated by file-system path utilities.
On Windows this resulted in URLs that had backslashes, which are invalid for such URLs.

Fixes #51
Closes #235
Closes #330
Closes #327
