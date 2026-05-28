---
"wrangler": patch
---

`wrangler secrets-store secret create` and `secret update` now reject secret values larger than 64 KiB (65,536 bytes) with a clear error before calling the Cloudflare API. Previously the CLI accepted them, the secret appeared in `secret list`, and the failure surfaced later (and confusingly) at worker deploy time as a "secret doesn't exist" error against the binding. 64 KiB is the cap enforced by the API; the CLI now enforces it at the same boundary.
