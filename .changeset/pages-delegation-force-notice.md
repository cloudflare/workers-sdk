---
"wrangler": patch
---

Improve the agent-facing `--force` guidance for Pages-to-Workers delegation

When an AI agent opts out of the Pages-to-Workers delegation by passing `--force` to `wrangler pages deploy` or `wrangler pages project create`, Wrangler now prints a notice at the end of a successful command explaining that `--force` only needs to be passed once: the project then exists, so subsequent commands are no longer delegated and do not need the flag.
