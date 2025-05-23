---
"wrangler": patch
---

add warning about env not specified to potentially risky wrangler commands

add a warning suggesting users to specify their target environment (via `-e` or `--env`)
when their wrangler config file contains some environments and they are calling one
of the following commands:

- wrangler deploy
- wrangler versions upload
- wrangler versions deploy
- wrangler versions secret bulk
- wrangler versions secret put
- wrangler versions secret delete
- wrangler secret bulk
- wrangler secret put
- wrangler secret delete
- wrangler triggers deploy (TODO: manually test)

this is a measure we're putting in place to try to prevent developers from accidentally apply
changes to an incorrect (potentially even production) environment
