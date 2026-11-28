---
"miniflare": patch
---

Stop the inspector proxy crashing the process when workerd restarts

Miniflare kills workerd whenever it restarts or is disposed. This can reset the inspector proxy's connection to workerd, sometimes before the connection has opened. That connection had no `error` listener, so the reset was thrown as an uncaught `ECONNRESET` exception. The proxy now logs it at debug level. Messages from DevTools that arrive before the connection to workerd has opened are now sent once it opens, instead of throwing an uncaught exception.

`setOptions()` also no longer restarts the inspector proxy's server when `inspectorPort` is changed to the port the server already listens on, for example one it was given through port 0.

When `setOptions()` fails to move the inspector proxy to a new port on the same host, the server keeps listening on the old port and now serves the restarted workerd's Workers instead of the stopped ones. A move to another host closes the old server first, so a failure leaves the inspector unavailable. Either way, a failed move no longer blocks requests once the inspector is disabled, and a later `setOptions()` call tries the move again.

Moving the inspector proxy to another port or host with `setOptions()` no longer hangs while DevTools are attached. The old server's DevTools connections are now closed when it is retired.
