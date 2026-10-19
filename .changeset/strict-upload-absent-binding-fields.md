---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Stop `--strict` deploys and version uploads from aborting when the API omits optional binding fields

Previously, `wrangler deploy --strict` and `wrangler versions upload --strict` could report a destructive change for an unchanged configuration, for example an R2 bucket in the default jurisdiction, because a field the API left out was compared as removed. Missing and unset optional fields are now treated as equal, so these commands proceed when the local configuration matches the deployed Worker.
