---
"miniflare": minor
---

Add workflow diagram API endpoint and plumbing for local explorer

Threads the workflow diagram payload from wrangler through miniflare's plugin system to the local explorer worker. Adds `dag` field to `WorkflowOption`, `WorkflowBindingInfo`, and the explorer binding map. Adds a `GET /api/workflows/:name/graph` endpoint to the explorer worker that serves the diagram JSON, along with the corresponding OpenAPI schema definition.
