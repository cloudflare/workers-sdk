---
"miniflare": patch
---

Keep a Hyperdrive client socket error from crashing the local dev process

The local Hyperdrive proxy listened for errors on the database socket only. A reset from the workerd client had no listener, so Node treated it as an unhandled exception and exited `wrangler dev` or the test runner. Client socket errors are now destroyed on both ends of the proxy.
