---
"wrangler": patch
---

Treat "Unable to authenticate request [code: 10001]" API errors as authentication errors

When the Cloudflare API rejected credentials with `Unable to authenticate request [code: 10001]`, for example during `wrangler deploy`, Wrangler showed the bare API error and suggested opening a bug report. It now gives the same guidance as for other authentication errors: a hint to check the API token's permissions when one is set, and the accounts the current credentials can access, with a warning if the configured `account_id` is not one of them. Other errors with code 10001, such as internal server errors, are unaffected.
