---
"miniflare": patch
---

Fix `unsafeEvictDurableObject()` blocking the Node.js event loop

Dev control calls (`evictDurableObject()` and `execDurableObjectSql()`) were proxied synchronously with `Atomics.wait()`. Eviction waits for the Durable Object's `waitUntil()` work, so if that work was waiting on Node.js (for example a function-valued service binding or `node-handler`), Node.js could never answer and eviction failed after workerd's 30 second timeout. These calls are now always asynchronous. A rejected RPC call made through the proxy is now also parsed as an asynchronous response, so errors such as evicting a Durable Object that is not running are still thrown.
