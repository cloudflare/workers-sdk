---
"@cloudflare/vite-plugin": patch
---

Fix `Cannot perform I/O on behalf of a different request` errors for deferred dynamic imports

Concurrent requests that loaded the same dynamic import were previously sharing the same promise to resolve it in a Worker context. We now ensure that all imports execute within a Durable Object's IoContext before the result is returned to the Worker.
