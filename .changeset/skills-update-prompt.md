---
"wrangler": minor
---

Add automatic update prompts for out-of-date Cloudflare agent skills

When Cloudflare skills were previously installed by Wrangler and the upstream `cloudflare/skills` repository has newer content, Wrangler now offers to update them after eligible commands complete.

To reduce prompt fatigue, the update check only runs when at least 7 days have elapsed since the last install or update, and only when the upstream changes are significant enough (5+ files changed or 10KB+ size delta). Declining suppresses the prompt until the next upstream change.

To opt out of update prompts entirely, set `"no_skills_update_prompts": true` in your `wrangler.jsonc` or set the `WRANGLER_NO_SKILLS_UPDATE_PROMPTS=true` environment variable. The `--install-skills` flag remains available regardless of this setting.
