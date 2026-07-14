---
"wrangler": minor
---

Show Local Explorer REST API endpoints in `wrangler dev --help` for AI coding agents

When `wrangler dev --help` is invoked by an AI coding agent (detected via `detectAgenticEnvironment`), the help output now includes a section describing the Local Explorer REST API endpoints. This section appears between the command description and the options list, giving agents the information they need to interact with local dev resources (KV, D1, R2, Durable Objects, Workflows) via REST. The full OpenAPI spec is available at `GET /cdn-cgi/explorer/api`. Human users see the standard help output unchanged.
