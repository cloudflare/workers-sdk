---
"wrangler": minor
---

Add `--json` flag to `wrangler containers info`.

`wrangler containers list` and `wrangler containers instances` already document `--json` as a boolean flag, but `wrangler containers info` only emitted JSON through the implicit `isNonInteractiveOrCI()` path (e.g. `CI=true`). Scripts that piped `wrangler containers info <ID> | jq` from a shell that wasn't detected as non-interactive received a human-readable banner instead, which `jq` couldn't parse. The flag now exposes the existing JSON path explicitly and matches the sibling commands' surface; behavior for callers that relied on the implicit non-TTY path is unchanged.
