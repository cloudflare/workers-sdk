---
"miniflare": patch
---

Fix default-entrypoint routing for workers with assets or proxy layers

Local requests that enter a worker through its default fetch path now go through a per-worker ingress service before reaching user code. This keeps asset/router handling and other default-entrypoint fetch layers in front of the raw user worker, while `getWorker(name)` continues to expose the raw user worker for direct access.
