---
"wrangler": patch
---

Expand metrics collection to:

- Detect Pages & Workers CI
- Filter out default args (e.g. `--x-versions`, `--x-dev-env`, and `--latest`) by only including args that were in `argv`
