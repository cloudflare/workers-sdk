---
"wrangler": minor
---

Add AI agent detection to analytics events

Wrangler now detects when commands are executed by AI coding agents (such as Claude Code, Cursor, GitHub Copilot, etc.) using the `am-i-vibing` library. This information is included as an `agent` property in all analytics events, helping Cloudflare understand how developers interact with Wrangler through AI assistants.

The `agent` property will contain the agent ID (e.g., `"claude-code"`, `"cursor-agent"`) when detected, or `null` when running outside an agentic environment.
