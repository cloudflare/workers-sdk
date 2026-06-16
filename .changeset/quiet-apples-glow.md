---
"miniflare": patch
---

Fix service binding and local routing for Workers with Assets

Requests to the default entrypoint of a Worker now consistently go through the same local pipeline used for Workers with Assets before reaching user code. This means service bindings, route-matched requests, direct sockets, and dev registry fetches all preserve asset routing when targeting an assets-backed Worker.

Direct worker access through `getWorker(name)`, named entrypoints, and Durable Objects continue to target the raw user worker.