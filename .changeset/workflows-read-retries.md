---
"wrangler": patch
---

Retry transient API failures in `wrangler workflows instances list` and `describe`

Previously, a single temporary 5xx response or dropped connection made these read-only commands exit with an error, even though the next request would have succeeded. They now use Wrangler's existing bounded API retry handling. The read that resolves `--id latest` is retried too, which also benefits the other `wrangler workflows instances` commands that accept `latest`; the mutating requests they make afterwards are not retried. Persistent failures are still reported after the retries are exhausted, and under `--json` any retry notices are written to stderr so stdout stays valid JSON.
