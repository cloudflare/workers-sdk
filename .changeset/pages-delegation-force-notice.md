---
"wrangler": patch
---

Improve the agent-facing `--force` guidance for Pages-to-Workers delegation and stop emitting the low-signal `skipped` telemetry event

When an AI agent opts out of the Pages-to-Workers delegation by passing `--force` to `wrangler pages deploy` or `wrangler pages project create`, Wrangler now prints a notice at the end of a successful command explaining that `--force` only needs to be passed once: the project then exists, so subsequent commands are no longer delegated. Wrangler also no longer emits a telemetry event for delegations that were skipped because the command was ineligible (for example the account already has Pages projects), since those are expected, deterministic cases that carry no signal.
