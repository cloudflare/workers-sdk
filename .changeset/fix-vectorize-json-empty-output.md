---
"wrangler": patch
---

Fix `vectorize list` and `vectorize list-metadata-index` to output clean JSON with `--json` flag when results are empty

Previously, when using the `--json` flag with empty results, these commands would output warning messages mixed with the JSON output, making it unparseable. Now the JSON output is returned cleanly without any log messages, even when the result set is empty.
