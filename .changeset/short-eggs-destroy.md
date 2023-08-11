---
"wrangler": patch
---

Improve source map support

Extends stack trace translations to terminal logs and DevTools console. Error stack traces logged to the terminal will show relative paths and should now be CTRL-clickable in VSCode. Error stack traces shown in Dev console should now link to the mapped source file in the Sources panel for `console.log`ed errors in addition to thrown errors.
