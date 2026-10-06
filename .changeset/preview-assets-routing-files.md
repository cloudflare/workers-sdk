---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fix `wrangler preview` deployments with a Worker script and `_headers` or `_redirects` assets files.

The beta Preview command now sends these files in the assets configuration, like `wrangler deploy`, instead of treating them as Worker modules. This also fixes assets-only Preview deployments that use routing files.
