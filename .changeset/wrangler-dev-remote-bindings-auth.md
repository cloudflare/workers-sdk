---
"wrangler": patch
---

Keep the remote bindings session when you remove the last remote binding

When you removed the last remote binding while `wrangler dev` was running, Wrangler restarted the remote bindings session with credentials that ignored `--profile` and the `account_id` in your Wrangler config. So it could use a different account or ask you to choose one. Wrangler now keeps the existing session, and only starts a new one when you add a remote binding again.
