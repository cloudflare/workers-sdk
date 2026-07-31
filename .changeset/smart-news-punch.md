---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Report a clear error for account IDs that can't be used in a Cloudflare API request

Account IDs are substituted straight into Cloudflare API URL paths, so a value containing non-ASCII characters previously failed deep inside the request layer with an opaque `Cannot convert argument to a ByteString` error that gave no hint about which setting was at fault. Account IDs read from `CLOUDFLARE_ACCOUNT_ID` and from the `account_id` configuration field are now validated up front, and an invalid value fails with a message naming both the offending value and where it came from.
