---
"miniflare": patch
---

Detect early workerd exit instead of hanging indefinitely

When `workerd` exits during startup before writing all expected listen events to the control file descriptor (e.g. due to an IPv6 bind failure, permission error, or missing library), Miniflare's `waitForPorts()` would block forever. This caused `wrangler dev` to stall at "Starting local server..." with no error and no timeout.

The fix races `waitForPorts()` against the child process exit event so that any unexpected `workerd` termination is detected immediately. When `workerd` exits early, Miniflare now throws `ERR_RUNTIME_FAILURE` with the runtime's stderr output included in the error message, making the root cause diagnosable without external tools.
