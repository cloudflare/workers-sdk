---
"wrangler": patch
---

Improve `wrangler deploy` flow to also check for potential (and likely unintentional) secrets overrides

Now when you run `wrangler deploy` wrangler will check the remote secrets for your workers, if some of your environment variables or bindings share the same name to some of such secrets then wrangler will warn you and ask you for your permission before proceeding
