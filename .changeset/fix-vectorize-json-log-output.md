---
"wrangler": patch
---

fix: suppress status log messages when `--json` flag is used in `vectorize list` and `vectorize list-metadata-index` commands

Previously, these commands printed a status message (e.g. "📋 Listing Vectorize indexes...") to stdout before the JSON output, making the combined output invalid JSON and breaking tools like `jq`. The status messages are now suppressed when `--json` is passed.
