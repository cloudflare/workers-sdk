---
"wrangler": minor
---

Add automatic update prompts for out-of-date Cloudflare agent skills

When Cloudflare skills were previously installed by Wrangler and the upstream `cloudflare/skills` repository has newer content, Wrangler now offers to update them after eligible commands complete.

To reduce prompt fatigue, the update check only runs when at least 7 days have elapsed since the last install or update, and only when the upstream changes are significant enough (5+ files changed or 10KB+ size delta). Declining suppresses the prompt until the next upstream change.

When declining an update, Wrangler offers the option to permanently disable future update prompts. This preference is stored globally in `~/.wrangler/agents-skills-install.jsonc`. The `WRANGLER_NO_SKILLS_UPDATE_PROMPTS=true` environment variable can also be used to suppress prompts. The `--install-skills` flag remains available regardless of these settings.
