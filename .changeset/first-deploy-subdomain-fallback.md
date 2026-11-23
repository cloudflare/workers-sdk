---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fix intermittent subdomain lookup failures on a Worker's first deploy

After a successful first upload, `wrangler deploy` can now read the subdomain settings from the script API if the Worker API does not yet see the new Worker. The normal deploy continues without waiting for the Worker API to catch up.
