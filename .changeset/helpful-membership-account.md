---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Add account-ID guidance when automatic account discovery fails with API error 10001 on `/memberships`

The error now suggests setting `CLOUDFLARE_ACCOUNT_ID` or adding `account_id` to the CLI configuration when using an account-owned API token. This keeps the original API error and authentication behaviour while explaining how to select an account without querying the user-scoped endpoint.
