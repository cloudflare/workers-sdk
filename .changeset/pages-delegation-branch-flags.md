---
"wrangler": minor
---

Delegate agent Pages project creation with a production branch to Workers

When run by an AI agent, `wrangler pages project create --production-branch <name>` is now eligible for delegation to a Workers static-assets deploy. The production branch names the target that a Workers deploy would publish to, so it does not need to disqualify a brand-new project from delegation.

`wrangler pages deploy --branch <name>` remains on Pages because an interactive new-project flow separately prompts for its production branch. The deployment branch may therefore represent a preview and cannot safely be converted into a production Workers deployment.
