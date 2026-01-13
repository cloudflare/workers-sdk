---
"wrangler": patch
---

Use argument array when executing git commands with `wrangler pages deploy`

Pass user provided values from `--commit-hash` safely to underlying git command.
