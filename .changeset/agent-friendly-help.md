---
"wrangler": minor
---

Render `--help` as Markdown when an AI coding agent is detected

When Wrangler detects it is being run by an autonomous AI coding agent (via `am-i-vibing`, covering `agent` and `hybrid` environments), `--help` now outputs agent-friendly Markdown instead of the standard terminal layout. The standard, human-readable output is unchanged for interactive use.

The agent output is optimised for a single read: requesting help for a command renders its entire subtree in one go, so `wrangler kv --help` returns `kv` plus every descendant (`namespace`, `key`, `bulk`, and their leaf commands) with usage, positionals, options, and examples. The top-level `wrangler --help` stays a shallow, category-grouped overview.

You can override the auto-detection with the `WRANGLER_HELP_FORMAT` environment variable: set it to `agent` to force the Markdown output, or `human` to force the standard output.
