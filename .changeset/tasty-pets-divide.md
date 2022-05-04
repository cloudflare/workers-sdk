---
"wrangler": patch
---

polish: accept Enter as a valid key in confirm dialogs

Instead of logging "Unrecognised input" when hitting return/enter in a confirm dialog, we should accept it as a confirmation. This patch also makes the default choice "y" bold in the dialog.
