---
"wrangler": patch
---

In non-interactive mode remove the skills installation message

When Wrangler run in non interactive mode and it detected agents that it could install skills for, it would print a message such as:

`Cloudflare agent skills are available for: <DETECTED_AGENTS>. Run wrangler in an interactive terminal to install them, or use '--install-skills' to install without prompting.`

This message seems to be confusing and unhelpful so it has now been removed.
