---
"miniflare": minor
---

Added a `handleRuntimeStdio` which enables wrangler (or any other direct use of Miniflare) to handle the `stdout` and `stderr` streams from the workerd child process. By default, if this option is not provided, the previous behaviour is retained which splits the streams into lines and calls `console.log`/`console.error`.
