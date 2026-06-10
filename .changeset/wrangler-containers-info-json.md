---
"wrangler": minor
---

Add a `--json` flag to `wrangler containers info`.

Previously, `wrangler containers info` only emitted JSON when wrangler detected a non-interactive shell, so piping its output to a tool like `jq` from an interactive terminal returned the human-readable banner and failed to parse. The new `--json` flag makes JSON output explicit, matching the flag already available on `wrangler containers list` and `wrangler containers instances`.
