---
"miniflare": patch
---

Use `127.0.0.1` instead of `localhost` for the runtime inspector address

On systems where `getaddrinfo("localhost")` returns `::1` but IPv6 is disabled at the kernel level, `workerd` fails to bind the inspector socket and silently continues without emitting the `listen-inspector` event to the control FD. This caused `wrangler dev` to hang indefinitely at "Starting local server..." with no error output.

Using `127.0.0.1` explicitly is consistent with `DEFAULT_HOST`, `--debug-port`, and `resolveLocalhost()` already in the codebase.
