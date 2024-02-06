---
"wrangler": patch
---

fix: ensure `wrangler dev --log-level` flag applied to all logs

Previously, `wrangler dev` may have ignored the `--log-level` flag for some startup logs. This change ensures the `--log-level` flag is applied immediately.
