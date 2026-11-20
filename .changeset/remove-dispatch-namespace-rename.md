---
"wrangler": minor
---

Remove the `wrangler dispatch-namespace rename` command

Renaming a Workers for Platforms dispatch namespace left the namespace name stored in dispatcher bindings out of date, which could make Workers in the namespace impossible to read or delete by name. The Cloudflare API now rejects requests that change a dispatch namespace's name, so the command has been removed. To use a different name, create a new dispatch namespace and redeploy your Workers to it.
