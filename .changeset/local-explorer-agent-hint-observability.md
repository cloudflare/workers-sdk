---
"wrangler": patch
---

Include the local observability query endpoint in the agent-facing Local Explorer hint

The hint `wrangler dev` prints for AI-agent sessions now lists `POST /cdn-cgi/explorer/api/local/observability/query`, so agents can discover the read-only SQL endpoint for captured request traces and console logs (the `spans` and `logs` tables) alongside the existing binding and storage routes.
