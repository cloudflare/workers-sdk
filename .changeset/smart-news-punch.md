---
"wrangler": patch
---

Improve invalid account ID errors before API requests

Wrangler now validates account IDs taken from `CLOUDFLARE_ACCOUNT_ID` and from the `account_id` config field before using them in Cloudflare API paths. This avoids low-level `ByteString` failures and shows a clear error when the value contains unsupported characters.
