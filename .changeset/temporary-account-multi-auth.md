---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Fix the `--temporary` error on commands that authenticate more than one time

`wrangler d1 migrations apply --remote --temporary` failed with this error: `You're already authenticated with Cloudflare, so --temporary can't be used`. The failure occurred with no login and with no `CLOUDFLARE_API_TOKEN`. This command authenticates one time for each statement that it runs. The first authentication makes a temporary preview account. The second authentication read the token of this new account as an earlier login.

Wrangler now uses again the temporary account from the same command run. Commands that authenticate more than one time now work as `wrangler deploy --temporary` works. If real credentials are available, `--temporary` is still an error.
