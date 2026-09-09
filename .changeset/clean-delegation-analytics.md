---
"wrangler": minor
---

Correct Pages-to-Workers delegation analytics for forced and ineligible commands

The legacy `forced` result counted every agent-driven Pages command using `--force`, including commands that could never have been delegated. Wrangler now emits `eligible_forced` only when `--force` prevents an otherwise eligible delegation, and records other agent commands as `ineligible` with a bounded reason and whether force was used.
