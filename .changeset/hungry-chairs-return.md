---
"wrangler": patch
---

refactor: create a custom CLI wrapper around Miniflare API

This allows us to tightly control the options that are passed to Miniflare.
The current CLI is setup to be more compatible with how Wrangler 1 works, which is not optimal for Wrangler 2.
