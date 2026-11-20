---
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Retry temporarily unreadable Worker versions before deploying

The API can report a Worker version as not found (code 100146) for a while after its upload has succeeded. `wrangler versions deploy` read the versions it was asked to deploy without retrying, so deploying a version straight after uploading it could fail. `wrangler deploy` did retry when it read a version back to apply Container settings, but only for about two seconds, which was not always long enough.

Both now retry these reads for up to about a minute, and so do the commands that read the versions in a Worker's current deployment. Wrangler prints a message when it starts retrying. A version ID that really does not exist is reported after the same delay.
