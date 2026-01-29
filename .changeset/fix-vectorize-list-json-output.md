---
"wrangler": patch
---

Suppress log messages in vectorize list commands when using --json flag

The `wrangler vectorize list --json` and `wrangler vectorize list-metadata-index --json` commands were outputting log messages before the JSON data, making the output invalid JSON and breaking programmatic parsing. These log messages are now only shown when the --json flag is not set.
