---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Preserve binding options when provisioning resources through a redirected config

Wrangler now writes provisioned resource identifiers to both the redirected and original config files without copying other binding options between them. This prevents generated relative paths such as D1 `migrations_dir` from replacing user-authored paths during Vite deployments.
