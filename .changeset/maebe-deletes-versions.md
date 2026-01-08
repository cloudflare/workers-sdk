---
"wrangler": minor
---

Add `wrangler versions delete` command

Adds a new CLI command to delete specific Worker versions that have been uploaded but not deployed. This uses the beta Workers API endpoint and includes:

- `--name` flag to specify the Worker name
- `--yes` / `-y` flag to skip confirmation prompt
- `--json` flag for machine-readable output
- Confirmation prompt by default (safe for CI with `fallbackValue: false`)
