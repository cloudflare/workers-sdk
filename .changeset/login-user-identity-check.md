---
"wrangler": minor
---

Add `wrangler login --user=<email>` to verify the resulting OAuth identity matches the expected account, and restore unconditional auth-URL printing

When `--experimental-websocket-callback` is used, the auth URL is delivered to a relay worker that routes by `state`. A leaked URL could allow an attacker to substitute their own auth code into the victim's session, causing the victim's wrangler to silently log in to the attacker's account. The previous mitigation suppressed the URL from stdout, which broke copy-paste workflows in environments where the browser cannot auto-open.

`wrangler login` now supports `--user=<email>` (alias `-u`) to mechanically assert the resulting account email after token exchange. Mismatch aborts the login before any token is written to disk. When using `--experimental-websocket-callback` non-interactively, `--user` is required; without it wrangler fails with an actionable error pointing at `--user` or `CLOUDFLARE_API_TOKEN`. Interactive runs prompt to confirm the resolved email. The default localhost flow is not vulnerable to this attack class (the OAuth `redirect_uri` lives on the user's local machine), so it just prints `Logged in as <email>` informationally.

With this defense in place the auth URL is now printed unconditionally again on both flows so users in environments where the browser cannot auto-open can copy the link manually.
