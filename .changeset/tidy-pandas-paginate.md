---
"wrangler": minor
---

Add explicit pagination to container instance JSON output

Use `wrangler containers instances <application_id> --json --per-page <size>` to return one page with machine-readable `result_info`, then pass its `next_page_token` to `--page-token` to retrieve the next page. Plain `--json` remains backward-compatible: it requests the complete list and returns the existing top-level array.
