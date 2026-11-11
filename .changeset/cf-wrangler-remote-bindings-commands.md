---
"wrangler": patch
---

Name `cf` commands and `cloudflare.config.ts` settings in remote bindings errors from `cf-wrangler`

When `cf` runs development through the `cf-wrangler` delegate and remote bindings cannot be authenticated, the error now tells you to run `cf auth whoami`, `cf auth logout` and `cf auth login` instead of the Wrangler commands, and the Cloudflare Access hint names cf. The Flagship error for a binding whose app has not been created now names the binding's `id` setting instead of `app_id`, and suggests `cf flagship apps create`. `wrangler dev` still names Wrangler's commands and settings.
