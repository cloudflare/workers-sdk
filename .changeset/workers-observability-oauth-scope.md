---
"@cloudflare/workers-auth": minor
"wrangler": minor
---

Request the `workers_observability:read` OAuth scope on login

`wrangler login` now requests read access to Workers Observability, which the experimental Workers Observability tail needs. If you logged in before this change and run `wrangler tail --experimental-wobs-tail`, Wrangler explains how to re-authenticate (`wrangler login`, or `wrangler auth create <profile>` for named profiles) instead of failing with a generic "Forbidden" error.
