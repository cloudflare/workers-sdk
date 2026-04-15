---
"miniflare": patch
---

Close the undici connection pool on dispose to prevent test hangs

The internal undici `Pool` used to dispatch fetch requests to the workerd runtime was not being closed during `Miniflare.dispose()`. This could leave lingering TCP sockets that kept the Node.js event loop alive, causing processes (particularly tests using `node --test`) to hang intermittently instead of exiting cleanly. The pool is now explicitly closed during disposal, and the previous pool is also closed when the runtime entry URL changes.
