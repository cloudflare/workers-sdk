---
"wrangler": patch
---

fix: use worker name as a script ID when generating a preview session

When generating a preview session on the edge with `wrangler dev`, for a zoned worker we were using a random id as the script ID. This would make the backend not associate the dev session with any resources that were otherwise assigned to the script (specifically for secrets, but other stuff as well) The fix is simply to use the worker name (when available) as the script ID.

Fixes https://github.com/cloudflare/wrangler2/issues/1003
Fixes https://github.com/cloudflare/wrangler2/issues/1172
