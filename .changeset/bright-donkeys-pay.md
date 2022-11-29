---
"wrangler": patch
---

Trigger login flow if a user runs `wrangler dev` while logged out

Previously, we would just error if a user logged out and then ran `wrangler dev`.
Now, we kick them to the OAuth flow and suggest running `wrangler dev --local` if
the login fails.

Closes [#2147](https://github.com/cloudflare/wrangler2/issues/2147)
