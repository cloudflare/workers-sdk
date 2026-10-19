---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fetch the remote config diff from the configured compliance region

When a Worker was last deployed from the dashboard, `wrangler deploy` and `wrangler versions upload` download its remote configuration to compare with the local one. These requests ignored the `compliance_region` field in the Wrangler configuration file and only honoured the `CLOUDFLARE_COMPLIANCE_REGION` environment variable. A FedRAMP High Worker configured through the config file would send them to `api.cloudflare.com` instead of `api.fed.cloudflare.com`, and the deploy would fail with authentication errors. They now use the same compliance region as the rest of the deploy.
