---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Keep Preview secrets when deploying to an existing Preview

Secrets added to a Preview with `wrangler preview secret put` or `wrangler preview secret bulk` were lost the next time `wrangler preview` ran, because each new deployment was created from the Wrangler config, `--var` and `--secrets-file` values only.

`wrangler preview` now carries over the secrets of the Preview's latest deployment. A value passed in this deployment (`--secrets-file`, `--var` or a `previews` binding with the same name) still replaces the existing secret, and `wrangler preview secret delete` removes one.
