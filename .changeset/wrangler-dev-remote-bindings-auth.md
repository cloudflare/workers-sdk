---
"wrangler": patch
---

Keep `wrangler dev`'s credentials when you remove the last remote binding

When you removed the last remote binding while `wrangler dev` was running, Wrangler restarted the remote bindings session with credentials that ignored `--profile` and the `account_id` in your Wrangler config. So it could use a different account or ask you to choose one. The restart now uses the same credentials as the rest of `wrangler dev`.
