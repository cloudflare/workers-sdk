---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Preserve user config binding fields when provisioning resources through a redirected config

Wrangler now writes only newly provisioned resource identifiers into the original config, preventing generated relative paths such as D1 `migrations_dir` from replacing user-authored paths during Vite deployments.
