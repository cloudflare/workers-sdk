---
"wrangler": patch
---

Mention `--secrets-file` in required-secrets error messages so first deploys have a working remedy

When a Worker declares `secrets.required` and is deployed for the first time, `wrangler secret put` cannot set those secrets because the Worker does not exist yet (the API rejects it). The first-deploy error now leads with `wrangler deploy --secrets-file <FILE>` as the way to supply required secrets in a single step, and the missing-secret API errors for `deploy` and `versions upload` now mention `--secrets-file` alongside the existing `wrangler secret put` / `wrangler versions secret put` guidance for Workers that already exist.
