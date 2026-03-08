---
"wrangler": patch
---

Fix `wrangler d1 execute --json` returning `"null"` (string) instead of `null` (JSON null) for SQL NULL values

When using `wrangler d1 execute --json` with local execution, SQL NULL values were incorrectly serialized as the string `"null"` instead of JSON `null`. This produced invalid JSON output that violated RFC 4627. The fix removes the explicit null-to-string conversion so NULL values are preserved as proper JSON null in the output.
