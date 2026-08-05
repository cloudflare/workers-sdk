---
"wrangler": minor
---

Add `wrangler preview secret put`, `delete`, `list`, and `bulk` for managing secrets on a named Worker Preview

These private-beta commands manage secrets on a single named Preview's latest deployment, without affecting production, other Previews, or the Worker's Previews base configuration. `put`, `delete`, and `bulk` create a new Preview deployment that goes live at 100% immediately and report the live Preview URL on success; `list` reads the latest deployment and prints secret names with values masked. Each command accepts `--name` to target a Preview (defaulting to the current git branch).
