---
"create-cloudflare": patch
---

fix: Ensure we exit the process on "SIGINT" and "SIGTERM"

Currently C3 does not explicitly exit the process if an error is thrown, or if a "SIGINT" or "SIGTERM" signal is received. This leads to situations when, if `ctrl+C` is pressed while there are still tasks in the stack/microtask queues (think in flight async xhr calls, or polling, or long running
`while` loops), the current process will continue running until all those tasks are run to completion, and the queues are empty.

This commit fixes this by explicitly calling `process.exit()` when an error is thrown (our internal "SIGINT"/"SIGTERM" handlers will throw a `CancelError`), thus ensuring we always exit the process.
