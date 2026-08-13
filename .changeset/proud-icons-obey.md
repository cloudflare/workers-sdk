---
"@cloudflare/deploy-helpers": minor
"wrangler": minor
---

[private beta]: Updates the `--ignore-defaults` flag to `--ignore-base-config` on `wrangler preview` commands.

`--ignore-base-config` now only takes effect on Preview creation, rather than on each deployment, since Preview base configuration is now copy-on-create rather than inherit-on-deploy.
