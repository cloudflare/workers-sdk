---
"wrangler": patch
---

feat: describe current permissions in `wrangler whoami`

Often users experience issues due to tokens not having the correct permissions associated with them (often due to new scopes being created for new products). With this, we print out a list of permissions associated with OAuth tokens with the `wrangler whoami` command to help them debug for OAuth tokens. We cannot access the permissions on an API key, so we direct the user to the location in the dashboard to achieve this.
We also cache the scopes of OAuth tokens alongside the access and refresh tokens in the .wrangler/config file to achieve this.

Currently unable to implement https://github.com/cloudflare/wrangler2/issues/1371 - instead directs the user to the dashboard.
Resolves https://github.com/cloudflare/wrangler2/issues/1540
