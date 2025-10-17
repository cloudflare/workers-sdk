---
"wrangler": patch
---

When either WRANGLER_OUTPUT_FILE_PATH or WRANGLER_OUTPUT_FILE_DIRECTORY are set
in the environment, then command failures will append a line to the output file
encoding the error code and message, if present.
