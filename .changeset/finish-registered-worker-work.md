---
"@cloudflare/vitest-plugin": patch
---

Finish registered Worker background work before shutting down the test runner

Wait for `ExecutionContext.waitUntil()` work while the runner can still load modules. Report background failures and unfinished work instead of allowing a passing test run to discard them; work already awaited through `waitOnExecutionContext()` is not reported twice.
