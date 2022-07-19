---
"wrangler": patch
---

polish: recommend using an account id when user details aren't available.

When using an api token, sometimes the call to get a user's membership details fails with a 9109 error. In this scenario, a workaround to skip the membership check is to provide an account_id in wrangler.toml or via CLOUDFLARE_ACCOUNT_ID. This bit of polish adds this helpful tip into the error message.
