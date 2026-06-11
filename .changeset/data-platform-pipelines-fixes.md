---
"wrangler": patch
---

Fix `pipelines sinks list --json` outputting invalid JSON

The `--json` flag on `wrangler pipelines sinks list` was using `logger.log()` instead of `logger.json()`, producing Node.js `util.inspect` output (unquoted keys, `[Object]` placeholders) rather than valid JSON. The output can now be reliably piped to `jq` or consumed by scripts.
