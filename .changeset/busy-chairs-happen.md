---
"wrangler": patch
---

- Rename `wrangler pipelines show` to `wrangler pipelines get`
- Replace `--enable-worker-binding` and `--enable-http` with `--source worker` and `--source http` (or `--source http worker` for both)
- Remove `--file-template` and `--partition-template` flags from `wrangler pipelines create|update`
- Add pretty output for `wrangler pipelines get <pipeline>`. Existing output is available using `--format=json`.
