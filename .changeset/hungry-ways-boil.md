---
"wrangler": patch
---

fix: stop wrangler spamming console after login

If a user hasn't logged in and then they run a command that needs a login they'll get bounced to the login flow.
The login flow (if completed) would write their shiny new OAuth2 credentials to disk, but wouldn't reload the
in-memory state. This led to issues like #693, where even though the user was logged in on-disk, wrangler
wouldn't be aware of it.

We now update the in-memory login state each time new credentials are written to disk.
