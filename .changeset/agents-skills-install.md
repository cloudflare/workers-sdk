---
"wrangler": minor
---

Add automatic Cloudflare skills installation for AI coding agents

Wrangler now detects AI coding agent configuration directories (e.g. Claude Code, Cursor, Cline, Gemini CLI, OpenCode) and offers to install Cloudflare skill files from the `cloudflare/skills` GitHub repository. Users are prompted once interactively; subsequent runs skip the prompt. Use `--experimental-force-skills-install` (alias `--x-force-skills-install`) to install without prompting.
