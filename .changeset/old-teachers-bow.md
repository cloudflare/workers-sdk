---
"wrangler": minor
---

feat: add sanitised error messages to Wrangler telemetry

Error messages that have been audited for potential inclusion of personal information, and explicitly opted-in, are now included in Wrangler's telemetry collection. Collected error messages will not include any filepaths, user input or any other potentially private content.
