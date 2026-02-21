---
"wrangler": minor
---

feat: Warn and abort when running outdated major version in AI-assisted coding environments

LLMs sometimes install outdated versions of Wrangler by mistake. This change detects when Wrangler is running in an agentic environment (Cursor, Claude Code, Copilot, Windsurf, OpenCode, Zed, Replit, etc.) and shows a prominent one-time warning if the installed version is a major version behind the latest release.

**Behavior:**

- In interactive mode: Shows a warning box and prompts the user to continue or abort
- In non-interactive mode (most agentic environments): Shows an LLM-friendly XML-formatted error message and aborts, allowing the LLM to update Wrangler and retry
- In CI environments: Skipped entirely to avoid breaking builds

The warning is cached per-project (in `node_modules/.cache/wrangler/`) and only shown once per major version gap. The install command shown is automatically detected based on the package manager being used (npm, pnpm, yarn, or bun).
