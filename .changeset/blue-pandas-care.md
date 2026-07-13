---
"wrangler": minor
"miniflare": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
---

Add automatic provisioning for draft Flagship bindings

Wrangler can now deploy a `flagship` binding that only specifies `binding`, matching the automatic provisioning flow already available for other draft bindings. On first deploy, Wrangler can inherit an existing app, connect an existing Flagship app, or create a new one and write the resulting `app_id` back to your config.
