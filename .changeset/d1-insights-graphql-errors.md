---
"wrangler": patch
---

Fail the experimental `wrangler d1 insights` command with an actionable error when the GraphQL Analytics API rejects the request

Previously the command printed an empty `[]`. Rate limit errors now say how long to wait before retrying, and authorization errors name the "Account Analytics: Read" and "D1: Read" permissions the API token needs.
