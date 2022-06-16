---
"wrangler": patch
---

feat: Bundle Reporter [Publish & Dev](https://github.com/cloudflare/wrangler2/issues/405#issuecomment-1156762297)
The `publish` command will output a message of the "total upload"
which includes script + modules showing the original size versus gzip size.
The `dev` command will output the bundle report once on initial server startup, for current implemenation.
