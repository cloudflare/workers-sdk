---
"wrangler": minor
---

Add automatic Cloudflare skills installation for AI coding agents

Wrangler now detects AI coding agents and offers to install Cloudflare skill files from the `cloudflare/skills` GitHub repository. Users are prompted once interactively; subsequent runs skip the prompt. Use `--install-skills` to install without prompting.
