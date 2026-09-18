---
"@cloudflare/vitest-plugin": patch
---

fix: flush `console.log()` calls made from another I/O context without waiting for the runner's next message

Vitest awaits every RPC call it made before it reports a test file as finished. A `console.log()` from another I/O context (a handler reached through `SELF`, a queue consumer, a `waitUntil()` callback) is buffered and sent with the runner's next message, so a log with nothing from the runner following it — the last batch of a queue consumed as the file ends, for example — left the run waiting on itself: the file's tests passed and vitest never finished. The buffer is now flushed from the runner's context as soon as a log is buffered.
