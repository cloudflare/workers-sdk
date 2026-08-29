---
"wrangler": patch
---

Exit quietly instead of crashing when Wrangler's output pipe is closed early

Running a Wrangler command with both stdout and stderr going to a reader that stops early — `wrangler whoami 2>&1 | head`, or an agent/CI runner that captures combined output and times out — made Wrangler abort with a JavaScript heap out-of-memory error instead of exiting.

Node ignores `SIGPIPE`, so the failed write arrives as an unhandled `EPIPE` error event. That became an uncaught exception, and Sentry's handler for those logs the error with `console.error` before deferring `process.exit` behind a transport flush of up to two seconds. The `console.error` went to the stream that had just failed, raising another `EPIPE` that re-entered the handler well before the process was allowed to exit. Each turn allocated another `Error` with a captured stack, so Wrangler exhausted the heap and aborted, leaving a multi-hundred-megabyte core dump containing account data on systems that record them.

Wrangler now attaches an `error` listener to both stdio streams when run as a CLI, so a broken pipe stops output and exits cleanly instead of ever becoming an uncaught exception. Other stdio errors are still surfaced, and the programmatic API is unaffected.
