---
"wrangler": minor
---

Add experimental `--experimental-cf-build-output` flag to `wrangler build`

When used alongside `--experimental-new-config`, `wrangler build` now emits a self-contained Build Output API directory under `.cloudflare/output/v0/` instead of delegating to `wrangler deploy --dry-run`. This is an experimental feature to support future deployments via the `cf` CLI.
