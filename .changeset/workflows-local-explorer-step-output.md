---
"miniflare": minor
---

Add full step output retrieval to the Workflows local explorer

The Workflows instance details response now truncates step outputs — regular `step.do` results and `waitForEvent` payloads — to 1024 characters (with a `[truncated output]` marker), matching production. The local explorer also exposes `GET /workflows/{workflow_name}/instances/{instance_id}/step`, which returns the complete, untruncated output for a single step as a flat `{ status, error, output }` body (or `application/octet-stream` raw bytes when the step returned a ReadableStream). When a step whose inline preview was truncated is expanded, the explorer UI fetches the full output on demand, reading up to 2 MB and then cancelling the transfer — for larger outputs it shows the first 2 MB and points to `wrangler workflows instances step --output <file>` to download the full value.
