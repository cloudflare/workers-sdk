---
"wrangler": patch
---

fix: skip auto-config and OpenNext delegation when `--config` is explicitly provided

When `--config` is passed to `wrangler deploy`, the user is explicitly targeting a specific Worker configuration. Previously, wrangler would ignore `--config` and delegate to `opennextjs-cloudflare deploy` if it detected an OpenNext project in the working directory, silently deploying the wrong Worker. Now, both auto-config detection and OpenNext delegation are skipped when `--config` is provided, matching the existing behavior for `--script` and `--assets`.
