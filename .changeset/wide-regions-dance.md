---
"wrangler": patch
---

fix: use script_tag instead of script.tag when deploying

Script is null when creating a Worker via the new [Workers beta APIs](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/create/).

This change allows wrangler to create new deployments and upload versions to Workers created via `POST /accounts/{account_id}/workers/workers`
