---
"wrangler": patch
---

Mention temporary preview accounts in `wrangler whoami` output when unauthenticated

When you run `wrangler whoami` without being logged in, Wrangler now also tells you that you can deploy without logging in by running a command like `wrangler deploy --temporary` to use a temporary preview account.
