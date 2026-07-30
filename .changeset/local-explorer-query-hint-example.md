---
"wrangler": patch
---

Improve the agent-facing Local Explorer hint for the observability query endpoint

When a `wrangler dev` session is detected as running inside an AI agent, the hint for `POST /local/observability/query` now explains that the endpoint takes a read-only SQL query (SELECT/WITH only) over the captured `spans` and `logs` tables, notes that `attributes` is JSON (read via `json(attributes)`), and includes a copy-pasteable `curl` example. The full OpenAPI schema is demoted to a last-resort footer so agents reach for the small, actionable example first instead of fetching the large schema.
