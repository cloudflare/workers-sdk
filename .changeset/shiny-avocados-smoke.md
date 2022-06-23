---
"wrangler": patch
---

fix: show console.error/console.warn logs when using `dev --local`.

Prior to this change, logging with console.error/console.warn in a Worker wouldn't output anything to the console when running in local mode. This was happening because stderr data event handler was being removed after the `Debugger listening...` string was found.

This change updates the stderr data event handler to forward on all events to `process.stderr`.

Closes #1324
