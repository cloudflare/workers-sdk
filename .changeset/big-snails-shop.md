---
"wrangler": patch
---

Print deploy warnings even in non-interactive contexts when strict mode is off

Currently, wrangler deploy checks whether the incoming deploy configuration has destructive conflicts with the current configuration. Previously, we only performed this check in interactive contexts, or if the `--strict` flag was passed in. Now this warning is always printed, and it remains non-blocking in non-interactive contexts.
