---
"wrangler": patch
---

`wrangler secrets-store secret create` and `secret update` now reject secret values longer than 1024 characters with a clear error before calling the Cloudflare API. Previously the CLI accepted them, the secret appeared in `secret list`, and the failure surfaced later (and confusingly) at worker deploy time as a "secret doesn't exist" error against the binding. The 1024-character cap is enforced by the API and dashboard; the CLI now enforces it at the same boundary. Fixes [#14018](https://github.com/cloudflare/workers-sdk/issues/14018).
