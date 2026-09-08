---
"wrangler": patch
---

Fix per-query overrides for `wrangler ai-search search`

`--score-threshold`, `--max-num-results`, `--filter`, and `--reranking` are now sent using the AI Search request schema, so the service applies them to searches instead of ignoring them.
