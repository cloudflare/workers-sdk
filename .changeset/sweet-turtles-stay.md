---
"wrangler": patch
---

fix: ensure that container builds don't disrupt dev hotkey handling

currently container builds run during local development (via `wrangler dev` or `startWorker`) prevent the the standard hotkeys not to be recognized (most noticeable `ctrl+c` is ignored, preventing developers from existing the process), the changes here ensure that hotkeys are instead correctly handled and behave as expected
