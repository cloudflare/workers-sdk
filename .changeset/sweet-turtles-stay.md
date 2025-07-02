---
"wrangler": patch
---

fix: ensure that container builds don't disrupt dev hotkey handling

currently container builds run during local development (via `wrangler dev` or `startWorker`) prevent the standard hotkeys not to be recognized (most noticeably `ctrl+c`, preventing developers from existing the process), the changes here ensure that hotkeys are instead correctly handled as expected
