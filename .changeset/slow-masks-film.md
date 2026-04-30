---
"wrangler": patch
---

Skip confirmation prompts in `wrangler versions deploy` when versions are provided as CLI arguments

Passing version IDs or version specs to `wrangler versions deploy` now applies those values directly instead of opening interactive prompts to confirm the same versions and percentages. This makes the command easier to automate without requiring `--yes`.
