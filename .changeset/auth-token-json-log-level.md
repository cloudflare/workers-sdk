---
"wrangler": patch
---

Print `wrangler auth token --json` output regardless of `WRANGLER_LOG`

Previously the JSON was written through the normal log channel, so setting `WRANGLER_LOG` to `warn`, `error` or `none` made the command exit successfully with empty stdout. Tools that parse this output, such as the OpenNext Cloudflare adapter in CI, then failed to find any credentials. The JSON is now always printed, like other `--json` commands.
