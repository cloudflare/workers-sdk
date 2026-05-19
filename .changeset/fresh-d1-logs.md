---
"wrangler": patch
---

Fix D1 migration logging after failed JSON queries

D1 commands that temporarily suppress logs for JSON/internal queries now always restore the previous logger level after errors. This prevents a failed migration setup/query from hiding subsequent migration progress output.
