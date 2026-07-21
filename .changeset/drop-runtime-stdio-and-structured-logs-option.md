---
"miniflare": major
---

Only support structured workerd logs

The `handleRuntimeStdio` option (for handling the raw `workerd` stdout/stderr streams) and the `structuredWorkerdLogs` option (for toggling structured `workerd` logs) have been removed. Structured logging is now always enabled.

To receive `workerd`'s output, use `handleStructuredLogs`, which is passed parsed structured log entries. When no `handleStructuredLogs` handler is provided, logs are written to the console by default (`warn`/`error` to stderr, everything else to stdout).
