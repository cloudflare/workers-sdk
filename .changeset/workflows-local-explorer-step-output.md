---
"miniflare": minor
---

Add full step output retrieval to the Workflows local explorer

The Workflows instance details response truncates streamed step outputs to a short preview (or a placeholder for binary streams). Mirroring the production `/step` endpoint, the local explorer now exposes `GET /workflows/{workflow_name}/instances/{instance_id}/step`, which returns a flat `{ status, error, output }` body for a single step. The explorer UI fetches this on demand when a step whose inline preview was truncated is expanded.
