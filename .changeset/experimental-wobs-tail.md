---
"@cloudflare/workers-auth": patch
"wrangler": minor
---

Add an experimental Workers Observability backend for `wrangler tail`

The hidden `--experimental-wobs-tail` flag now opens an account-level Workers Observability live-tail stream, keeps its eligibility alive, translates supported filters, and prints compact telemetry output. Wrangler requests the required Workers Observability read scope for new OAuth logins and explains how existing OAuth users can re-authenticate when their token is missing it. The default tail implementation remains unchanged, and options without equivalent Observability semantics are rejected explicitly.
