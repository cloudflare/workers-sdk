---
"wrangler": patch
---

Fix misleading error guidance when deploying a new Worker with `secrets.required`

When a Worker declares `secrets.required` and has never been deployed before, the previous error message suggested running `wrangler secret put <NAME>`, which fails with `code: 10007` because the Worker doesn't exist yet. The `.dev.vars` / environment variable path was also suggested but does not work for `wrangler deploy`.

The one path that does work — `wrangler deploy --secrets-file <path>` — was not mentioned anywhere in the error output.

The pre-deploy error now explains that `wrangler secret put` cannot be used for a new Worker, and directs users to the `--secrets-file` flag instead. The post-deploy API error (code 10057) for existing Workers now also mentions `--secrets-file` alongside `wrangler secret put`.
