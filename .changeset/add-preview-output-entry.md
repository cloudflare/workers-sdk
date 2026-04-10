---
"wrangler": minor
---

Add `preview` output-file entries for `wrangler preview` deployments

`wrangler preview` now writes a `preview` entry to the Wrangler output file when `WRANGLER_OUTPUT_FILE_PATH` or `WRANGLER_OUTPUT_FILE_DIRECTORY` is configured. The entry includes the Worker name, preview metadata (`preview_id`, `preview_name`, `preview_slug`, `preview_urls`) and deployment metadata (`deployment_id`, `deployment_urls`).

This makes preview command runs machine-readable in the same output stream as other Wrangler commands, which helps CI integrations consume preview URLs and IDs directly.
