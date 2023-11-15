---
"wrangler": patch
---

This PR adds a fetch handler that uses `page`, assuming `result_info` provided by the endpoint contains `page`, `per_page`, and `total`

This is needed as the existing `fetchListResult` handler for fetching potentially paginated results doesn't work for endpoints that don't implement `cursor`.

Fixes #4349
